#!/usr/bin/env python3
"""Vercel 发布归档、只读预检及按部署 ID 清理；不读取或更改业务数据。"""
import argparse
import base64
import concurrent.futures
import contextlib
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request

TEAM = 'team_n6Aaq9rCmYd86BCXyEd4mCNJ'
PROJECTS = {
    'qiuyun': ('prj_bTVgrgB2yde06natDUjxaUPPrVvK', 'qiuyun-frontend.vercel.app'),
    'formward': ('prj_VuRFaY4Jc9akgrz2xi7n6pYN9MRK', 'global.formward.top'),
}
TERMINAL = {'READY', 'ERROR', 'CANCELED'}


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root, stderr=subprocess.DEVNULL).decode().strip()


def common_root(root):
    return Path(git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir')).parent


def private_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.open('w') as stream:
        os.fchmod(stream.fileno(), 0o600)
        json.dump(value, stream, ensure_ascii=False, indent=2)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


class Vercel:
    def __init__(self, root):
        self.root = root
        self.exe = os.environ.get('VERCEL_CLI') or shutil.which('vercel')
        if not self.exe:
            candidate = common_root(root) / '.tools/tooling/node_modules/.bin/vercel'
            if candidate.is_file():
                self.exe = str(candidate)
        if not self.exe:
            raise RuntimeError('找不到 Vercel CLI；请设置 VERCEL_CLI 或将其加入 PATH。')

    def raw(self, endpoint, method='GET', body=None):
        args = [self.exe, 'api', endpoint + ('&' if '?' in endpoint else '?') + 'teamId=' + TEAM,
                '--method', method, '--raw']
        if method == 'DELETE':
            args.append('--dangerously-skip-permissions')
        if body is not None:
            args += ['--input', '-']
        result = subprocess.run(args, cwd=self.root, input=json.dumps(body).encode() if body is not None else None,
                                capture_output=True, timeout=90)
        if result.returncode:
            raise RuntimeError('Vercel 请求失败：' + method + ' ' + endpoint.split('?')[0])
        return result.stdout

    def api(self, endpoint, method='GET', body=None):
        raw = self.raw(endpoint, method, body)
        return json.loads(raw) if raw.strip() else {}

    def pages(self, endpoint, field):
        rows, cursor, seen = [], None, set()
        while True:
            result = self.api(endpoint + ('&' if '?' in endpoint else '?') + 'limit=100' +
                              ('&until=' + str(cursor) if cursor else ''))
            rows.extend(result[field])
            cursor = (result.get('pagination') or {}).get('next')
            if cursor is None:
                return rows
            if cursor in seen:
                raise RuntimeError('Vercel 分页游标重复；拒绝使用不完整清单。')
            seen.add(cursor)


def rollback_ids(value):
    if isinstance(value, dict):
        return set().union(*(rollback_ids(v) for v in value.values())) if value else set()
    if isinstance(value, list):
        return set().union(*(rollback_ids(v) for v in value)) if value else set()
    return {value} if isinstance(value, str) and value.startswith('dpl_') else set()


def protection(rows, aliases, project):
    reasons = {}
    def keep(identifier, reason):
        if identifier:
            reasons.setdefault(identifier, []).append(reason)
    latest = sorted(rows, key=lambda row: row['created'], reverse=True)
    for row in latest[:3]:
        keep(row['uid'], '最近三个部署')
    ready = [r for r in latest if r.get('state', r.get('readyState')) == 'READY' and r.get('target') == 'production']
    for row in ready[:3]:
        keep(row['uid'], '最近三个成功 Production 部署')
    for alias in aliases:
        keep(alias.get('deploymentId') or (alias.get('deployment') or {}).get('id'), '域名：' + alias['alias'])
    for target in (project.get('targets') or {}).values():
        if isinstance(target, dict):
            keep(target.get('id'), '项目当前目标')
    for key, value in project.items():
        if 'rollback' in key.lower():
            for identifier in rollback_ids(value):
                keep(identifier, '项目回滚目标')
    return {key: reasons[key] for key in reasons if key in {row['uid'] for row in rows}}


def archive_store(root, key):
    return common_root(root) / ('.tools/backups/vercel-releases' if key == 'qiuyun' else '.codex/backups/vercel-releases')


def observe_production(store, key, state):
    current = next(a.get('deploymentId') or (a.get('deployment') or {}).get('id') for a in state['aliases'] if a['alias'] == PROJECTS[key][1])
    path = store / ('observed-production-' + key + '.json')
    history = json.loads(path.read_text()) if path.exists() else []
    if not history or history[-1] != current:
        history.append(current)
        private_json(path, history)


def inventory(api, key):
    pid, host = PROJECTS[key]
    # 三个独立只读端点并行，分页内部仍按游标顺序读取。
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        project_job = pool.submit(api.api, '/v9/projects/' + pid)
        rows_job = pool.submit(api.pages, '/v6/deployments?projectId=' + pid, 'deployments')
        aliases_job = pool.submit(api.pages, '/v4/aliases', 'aliases')
        project = project_job.result()
        rows = list({r['uid']: r for r in rows_job.result()}.values())
        aliases = aliases_job.result()
    own = [a for a in aliases if a.get('projectId') == pid or
           (a.get('deploymentId') or (a.get('deployment') or {}).get('id')) in {r['uid'] for r in rows}]
    if not any(a['alias'] == host for a in own):
        raise RuntimeError('找不到预期正式域名，停止操作。')
    reasons = protection(rows, own, project)
    history_path = archive_store(api.root, key) / ('observed-production-' + key + '.json')
    if history_path.exists():
        for identifier in json.loads(history_path.read_text())[-2:]:
            if identifier in {row['uid'] for row in rows}:
                reasons.setdefault(identifier, []).append('最近观察到的正式版本')
    active = [r for r in rows if r.get('state', r.get('readyState')) not in TERMINAL]
    candidates = sorted([r for r in rows if r['uid'] not in reasons and
                         r.get('state', r.get('readyState')) in TERMINAL], key=lambda r: r['created'])
    return {'project': key, 'projectId': pid, 'rows': rows, 'aliases': own,
            'protected': reasons, 'candidates': candidates, 'inFlight': [r['uid'] for r in active],
            'policy': project.get('deploymentExpiration')}


def signature(state):
    return sorted((a['alias'], a.get('deploymentId') or (a.get('deployment') or {}).get('id')) for a in state['aliases']), sorted(state['protected'])


def summary(state):
    return {k: state[k] for k in ['project', 'projectId', 'protected', 'inFlight', 'policy']} | {
        'total': len(state['rows']), 'candidates': [{'id': r['uid'], 'created': r['created']} for r in state['candidates']]}


def safe_relative(value):
    path = PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts or chr(92) in value or ':' in value:
        raise RuntimeError('归档路径不安全。')
    return path


def uploaded_files(nodes, parent=''):
    for node in nodes:
        path = parent + node['name']
        if node['type'] == 'directory':
            yield from uploaded_files(node.get('children', []), path + '/')
        elif path.startswith('src/.vercel/output/'):
            relative = path[len('src/.vercel/output/'):]
            safe_relative(relative)
            if not re.fullmatch('[0-9a-f]{40}', node.get('uid', '')):
                raise RuntimeError('Vercel 文件摘要无效。')
            yield relative, node
        elif not path.startswith('out/'):
            raise RuntimeError('无法识别的部署文件结构。')


def file_payload(raw, sha1):
    attempts = [raw]
    try:
        obj = json.loads(raw)
        if isinstance(obj, dict):
            for key in ['data', 'content']:
                if isinstance(obj.get(key), str):
                    attempts.append(obj[key].encode())
                    with contextlib.suppress(ValueError):
                        attempts.append(base64.b64decode(obj[key], validate=True))
    except (ValueError, UnicodeDecodeError):
        pass
    for payload in attempts:
        if hashlib.sha1(payload).hexdigest() == sha1:
            return payload
    raise RuntimeError('下载文件与 Vercel 摘要不同。')


def verify_archive(folder):
    manifest = json.loads((folder / 'manifest.json').read_text())
    if folder.name.startswith('dpl_') and folder.name != manifest['deploymentId']:
        raise RuntimeError('归档目录与部署标识不一致。')
    if manifest['projectId'] != PROJECTS[manifest['project']][0]:
        raise RuntimeError('归档项目标识不一致。')
    for relative, expected in manifest['artifacts'].items():
        safe_relative(relative)
        if digest(folder / relative) != expected:
            raise RuntimeError('归档校验失败：' + relative)
    with tarfile.open(folder / 'runtime.tar.gz') as tar:
        members = {m.name: m for m in tar.getmembers() if m.isfile()}
        if set(members) != {f['path'] for f in manifest['files']}:
            raise RuntimeError('运行包文件列表不一致。')
        for item in manifest['files']:
            safe_relative(item['path'])
            stream = tar.extractfile(members[item['path']])
            if hashlib.file_digest(stream, 'sha256').hexdigest() != item['sha256']:
                raise RuntimeError('运行包内部文件摘要不同。')
    return manifest


def database_baseline(stage):
    value = os.environ.get('RELEASE_DATABASE_URL')
    if not value:
        return None
    target = urllib.parse.urlsplit(value)
    if target.scheme not in ['postgres', 'postgresql'] or not target.hostname or not target.username or target.path.startswith(('/qiuyun_dev', '/qiuyun_test_')):
        raise RuntimeError('正式结构归档的源连接不正确。')
    env = {**os.environ, 'PGHOST': target.hostname, 'PGPORT': str(target.port or 5432),
           'PGUSER': urllib.parse.unquote(target.username), 'PGPASSWORD': urllib.parse.unquote(target.password or ''),
           'PGDATABASE': target.path[1:], 'PGCONNECT_TIMEOUT': '15',
           'PGSSLMODE': urllib.parse.parse_qs(target.query).get('sslmode', ['require'])[0],
           'PGOPTIONS': '-c default_transaction_read_only=on'}
    commands = [(['pg_dump', '--schema-only', '--schema=public', '--schema=drizzle', '--clean', '--if-exists', '--no-owner', '--no-privileges'], 'schema.sql'),
                (['psql', '-X', '-q', '-c', 'COPY drizzle.__drizzle_migrations TO STDOUT WITH CSV HEADER'], 'migration-journal.csv')]
    for command, name in commands:
        result = subprocess.run(command, env=env, capture_output=True, timeout=120)
        if result.returncode:
            raise RuntimeError('正式结构只读导出失败。')
        (stage / name).write_bytes(result.stdout)
    return '只读结构和原迁移记录；不含真实业务行'


def intern_baseline(store, stage):
    names = ['schema.sql', 'migration-journal.csv']
    normalized = []
    for name in names:
        text = (stage / name).read_text()
        if name == 'schema.sql':
            text = '\n'.join(line for line in text.splitlines() if not line.startswith(('\\restrict ', '\\unrestrict ', '-- Dumped from database version ')))
        normalized.append(text)
    identifier = hashlib.sha256(json.dumps(normalized).encode()).hexdigest()
    folder = store / 'database-baselines' / identifier
    if not folder.exists():
        folder.mkdir(mode=0o700, parents=True)
        for name in names:
            shutil.copyfile(stage / name, folder / name)
            (folder / name).chmod(0o600)
        private_json(folder / 'checksums.json', {name: digest(folder / name) for name in names})
    checks = json.loads((folder / 'checksums.json').read_text())
    for name in names:
        if digest(folder / name) != checks[name]:
            raise RuntimeError('共享数据库基线损坏，停止归档。')
        (stage / name).unlink()
        os.link(folder / name, stage / name)
    return identifier


def ready_deployment(detail, key):
    if detail.get('projectId') != PROJECTS[key][0] or detail.get('readyState', detail.get('state')) != 'READY':
        raise RuntimeError('只接受指定项目的 READY 部署。')


def archive(api, root, store, key, identifier, cache=None):
    if not re.fullmatch(r'dpl_[A-Za-z0-9]+', identifier):
        raise RuntimeError('部署 ID 格式不正确。')
    folder = store / key / identifier
    if folder.exists():
        manifest = verify_archive(folder)
        if key == 'qiuyun' and not manifest['databaseBaseline']:
            raise RuntimeError('旧归档缺少正式结构基线，不能作为本次发布依据。')
        return manifest
    if key == 'qiuyun' and not (os.environ.get('RELEASE_DATABASE_URL') or os.environ.get('RELEASE_DATABASE_BASELINE')):
        raise RuntimeError('湫云归档需显式提供只读正式结构连接或已核对的结构基线。')
    if shutil.disk_usage(store).free < 1024 ** 3:
        raise RuntimeError('本机可用空间不足 1GB，停止归档与清理。')
    detail = api.api('/v13/deployments/' + identifier)
    ready_deployment(detail, key)
    tree = api.api('/v6/deployments/' + identifier + '/files')
    items = list(uploaded_files(tree))
    if not items:
        raise RuntimeError('部署无可恢复文件。')
    parent = store / key
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='.' + identifier + '-', dir=parent))
    runtime = stage / 'runtime'
    runtime.mkdir(mode=0o700)
    caches = [Path(cache)] if cache else []
    caches += [root / '.vercel/output']
    # 兼容最早一次私有基线；所有缓存仍逐文件匹配原始摘要。
    caches += list((common_root(root) / '.tools/backups/vercel-releases').glob('*/' + key + '/vercel-output'))
    def fetch(item):
        relative, node = item
        payload = None
        for cached in caches:
            path = cached / relative
            if path.is_file() and hashlib.sha1(path.read_bytes()).hexdigest() == node['uid']:
                payload = path.read_bytes()
                break
        if payload is None:
            payload = file_payload(api.raw('/v8/deployments/' + identifier + '/files/' + node['uid']), node['uid'])
        path = runtime / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        path.chmod(int(node.get('mode', 0o100644)) & 0o777)
        return {'path': relative, 'bytes': len(payload), 'sha1': node['uid'], 'sha256': hashlib.sha256(payload).hexdigest()}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        files = list(pool.map(fetch, items))
    embedded = {p.read_text().strip() for p in runtime.rglob('SOURCE_COMMIT') if re.fullmatch('[0-9a-f]{40}', p.read_text().strip())}
    metadata_sha = (detail.get('meta') or {}).get('gitCommitSha')
    commits = embedded | ({metadata_sha} if metadata_sha else set())
    if not commits:
        raise RuntimeError('部署缺少源码版本标识。')
    for commit in sorted(commits):
        if not re.fullmatch('[0-9a-f]{40}', commit):
            raise RuntimeError('源码版本标识无效。')
        names = git(root, 'ls-tree', '--name-only', commit).splitlines()
        selected = [n for n in names if n not in ['verified', 'data', '.tools', '.codex']]
        with (stage / ('source-' + commit + '.tar.gz')).open('wb') as stream:
            subprocess.run(['git', 'archive', '--format=tar.gz', commit, *selected], cwd=root, stdout=stream, check=True, stderr=subprocess.DEVNULL)
    with tarfile.open(stage / 'runtime.tar.gz', 'w:gz') as tar:
        for path in sorted(runtime.rglob('*')):
            if path.is_file():
                tar.add(path, arcname=path.relative_to(runtime).as_posix(), recursive=False)
    environment = api.api('/v10/projects/' + PROJECTS[key][0] + '/env?target=production')
    private_json(stage / 'environment-keys.json', [{'key': v.get('key'), 'type': v.get('type'), 'target': v.get('target'), 'id': v.get('id'), 'updatedAt': v.get('updatedAt'), 'createdAt': v.get('createdAt')} for v in environment.get('envs', [])])
    # 数据库基线由维护者显式提供，不把本机开发连接当作正式结构。
    baseline = os.environ.get('RELEASE_DATABASE_BASELINE')
    database_reference = database_baseline(stage) if key == 'qiuyun' else None
    if baseline and database_reference is None:
        source = Path(baseline)
        for name in ['schema.sql', 'migration-journal.csv']:
            if not (source / name).is_file():
                raise RuntimeError('数据库基线缺少 ' + name)
            shutil.copyfile(source / name, stage / name)
        database_reference = '附带只读导出的结构与迁移记录；不含真实业务数据'
    baseline_id = intern_baseline(store, stage) if database_reference else None
    manifest = {'project': key, 'projectId': PROJECTS[key][0], 'teamId': TEAM, 'deploymentId': identifier,
                'regions': detail.get('regions'), 'nodeVersion': detail.get('nodeVersion'),
                'metadataSourceCommit': metadata_sha, 'embeddedSourceCommits': sorted(embedded),
                'sourceSnapshotProvenance': 'Git 提交快照；实际部署文件为原始上传内容，二者不推定等价',
                'runtimeConfigs': [json.loads(p.read_text()) for p in runtime.rglob('.vc-config.json')],
                'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'files': files,
                'databaseBaseline': database_reference, 'databaseBaselineId': baseline_id, 'businessDataIncluded': False,
                'secretValuesExported': False, 'sensitiveArchive': True, 'environmentProvenance': '归档时项目的 Production 配置元数据，不推定为历史部署的原始密钥版本', 'artifacts': {}}
    shutil.rmtree(runtime)
    (stage / 'RESTORE.md').write_text('恢复前在本目录运行 sha256sum -c SHA256SUMS（不需要 Git 或 Vercel 登录），再用仓库工具 verify 核对运行包内部文件。解压 runtime.tar.gz 到候选目录 .vercel/output。沿用原 Vercel 项目配置，先验收不接正式域名的候选，再切域名。源码快照、数据库版本和密钥另行核对；本包没有真实数据及密钥，不能单独恢复数据库。旧代码不应直接连接以后更新过的数据库。\n')
    manifest['artifacts'] = {p.name: digest(p) for p in stage.iterdir() if p.is_file()}
    private_json(stage / 'manifest.json', manifest)
    (stage / 'SHA256SUMS').write_text(''.join(digest(p) + '  ' + p.name + '\n' for p in sorted(stage.iterdir()) if p.is_file()))
    for path in stage.iterdir():
        if path.is_file():
            path.chmod(0o600)
    verify_archive(stage)
    stage.rename(folder)
    return manifest


def health(key, aliases=None):
    hosts = {PROJECTS[key][1]} | {a['alias'] for a in aliases or []}
    paths = ['/', '/api/auth/get-session'] if key == 'qiuyun' else ['/', '/api/app-version']
    results = []
    for host in sorted(hosts):
        for path in paths:
            request = urllib.request.Request('https://' + host + path, headers={'User-Agent': 'release-retention-health/1'})
            with urllib.request.urlopen(request, timeout=30) as response:
                if urllib.parse.urlsplit(response.url).hostname == 'vercel.com':
                    if host == PROJECTS[key][1]:
                        raise RuntimeError('正式主域名进入 Vercel 登录页，停止清理。')
                    results.append({'url': request.full_url, 'status': response.status, 'applicationChecked': False, 'protection': 'vercel-login'})
                    break
                payload = response.read()
                if response.status != 200 or not payload:
                    raise RuntimeError('正式服务只读检查失败。')
                if path != '/':
                    json.loads(payload)
                results.append({'url': request.full_url, 'status': response.status})
    if key == 'qiuyun':
        url = 'https://' + PROJECTS[key][1] + '/api/monthly-operations?month=2026-10'
        try:
            with urllib.request.urlopen(url, timeout=30):
                raise RuntimeError('业务 API 匿名访问未被拒绝，停止清理。')
        except urllib.error.HTTPError as error:
            if error.code != 401:
                raise RuntimeError('业务 API 登录保护检查失败。') from None
        results.append({'url': url, 'status': 401})
    return results


def cleanup(api, root, store, key, limit):
    initial = inventory(api, key)
    if initial['inFlight']:
        raise RuntimeError('存在进行中的部署，停止清理。')
    live = {a.get('deploymentId') or (a.get('deployment') or {}).get('id') for a in initial['aliases']}
    for identifier in live:
        manifest = verify_archive(store / key / identifier)
        if manifest['deploymentId'] != identifier or manifest['project'] != key:
            raise RuntimeError('正式域名归档不匹配。')
    before = health(key, initial['aliases'])
    deleted = []
    log = store / ('cleanup-' + key + '-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.json')
    private_json(log, {'before': summary(initial), 'deleted': deleted, 'healthBefore': before})
    for row in initial['candidates'][:limit]:
        current = inventory(api, key)
        if current['inFlight'] or signature(current) != signature(initial) or {r['uid'] for r in current['rows']} != {r['uid'] for r in initial['rows']} - set(deleted):
            raise RuntimeError('发布目标或部署清单已变化，停止清理并重新预检。')
        if row['uid'] not in {r['uid'] for r in current['candidates']}:
            raise RuntimeError('部署已受保护，停止清理。')
        api.api('/v13/deployments/' + row['uid'], 'DELETE')
        deleted.append(row['uid'])
        private_json(log, {'before': summary(initial), 'deleted': deleted, 'healthBefore': before})
    after = inventory(api, key)
    for identifier in initial['protected']:
        if identifier not in {r['uid'] for r in after['rows']}:
            raise RuntimeError('保留版本异常，停止操作。')
    checks = health(key, after['aliases'])
    private_json(log, {'before': summary(initial), 'deleted': deleted, 'healthBefore': before, 'healthAfter': checks, 'after': summary(after)})
    return {'deleted': len(deleted), 'remaining': len(after['rows']), 'candidatesRemaining': len(after['candidates']), 'report': str(log)}


def activate(api, key, identifier, state):
    if key == 'qiuyun':
        commands = [[api.exe, 'promote', identifier, '--yes', '--scope', 'opgobl1v-5358']]
    else:
        # 国际网关只更新原先承担该版本的别名，不接管仍指向旧目标的项目域名。
        canonical = next(a.get('deploymentId') or (a.get('deployment') or {}).get('id') for a in state['aliases'] if a['alias'] == PROJECTS[key][1])
        hosts = [a['alias'] for a in state['aliases'] if (a.get('deploymentId') or (a.get('deployment') or {}).get('id')) == canonical]
        commands = [[api.exe, 'alias', 'set', identifier, host, '--scope', 'opgobl1v-5358'] for host in hosts]
    for command in commands:
        result = subprocess.run(command, cwd=api.root, capture_output=True)
        if result.returncode:
            raise RuntimeError('正式版本切换失败；停止清理，请核对各域名指向。')


def set_policy(api, key):
    # 保留期使用专门接口的字符串周期，不属于通用项目 PATCH 的数字响应字段。
    # https://github.com/vercel/terraform-provider-vercel/blob/main/client/project_deployment_retention.go
    body = {'expiration': '1w', 'expirationProduction': '1w', 'expirationCanceled': '1w', 'expirationErrored': '1w'}
    api.api('/v9/projects/' + PROJECTS[key][0] + '/deployment-expiration', 'PATCH', body)
    actual = inventory(api, key)['policy']
    days = ['expirationDays', 'expirationDaysProduction', 'expirationDaysCanceled', 'expirationDaysErrored']
    if not actual or any(actual.get(name) != 7 for name in days):
        raise RuntimeError('七天保留策略回读不一致。')
    return actual


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['inspect', 'archive', 'verify', 'cleanup', 'policy', 'publish'])
    parser.add_argument('--project', required=True, choices=PROJECTS)
    parser.add_argument('--deployment')
    parser.add_argument('--cache')
    parser.add_argument('--limit', type=int, default=5, choices=range(1, 21))
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    owner = common_root(root)
    remote = git(root, 'remote', 'get-url', 'origin').lower()
    expected = 'qiuyun' if 'qiuyunfrontend' in remote else 'formward' if 'formward' in remote else None
    if args.project != expected:
        raise RuntimeError('项目选择与当前仓库不一致。')
    store = archive_store(root, args.project)
    if subprocess.run(['git', 'check-ignore', '--no-index', str(store / 'probe')], cwd=owner, capture_output=True).returncode:
        raise RuntimeError('备份目录没有被 Git 忽略，停止操作。')
    if args.command == 'verify':
        if not args.deployment:
            parser.error('verify 需要 --deployment')
        result = verify_archive(store / args.project / args.deployment)
        print(json.dumps({'verified': result['deploymentId'], 'files': len(result['files'])}))
        return
    api = Vercel(root)
    state = inventory(api, args.project)
    if args.command == 'inspect' or not args.apply:
        print(json.dumps(summary(state), ensure_ascii=False))
        return
    store.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (store / '.maintenance.lock').open('a') as lock:
        os.fchmod(lock.fileno(), 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.command in ['archive', 'publish']:
            if not args.deployment:
                parser.error('需要 --deployment')
            result = archive(api, root, store, args.project, args.deployment, args.cache)
            if args.command == 'archive':
                observe_production(store, args.project, inventory(api, args.project))
            print(json.dumps({'archived': result['deploymentId'], 'files': len(result['files'])}), flush=True)
            if args.command == 'publish':
                latest = inventory(api, args.project)
                if latest['inFlight'] or signature(latest) != signature(state):
                    raise RuntimeError('归档期间发布目标变化，停止提升正式版本。')
                detail = api.api('/v13/deployments/' + args.deployment)
                ready_deployment(detail, args.project)
                if args.project == 'formward' and detail.get('regions') != ['iad1']:
                    raise RuntimeError('国际网关实际区域不是 iad1，停止切换。')
                activate(api, args.project, args.deployment, latest)
                live = inventory(api, args.project)
                host = PROJECTS[args.project][1]
                if not any(a['alias'] == host and (a.get('deploymentId') or (a.get('deployment') or {}).get('id')) == args.deployment for a in live['aliases']):
                    raise RuntimeError('正式域名未指向目标版本；停止清理。')
                observe_production(store, args.project, latest)
                observe_production(store, args.project, live)
                print(json.dumps({'published': args.deployment, 'health': health(args.project, live['aliases'])}), flush=True)
                while True:
                    result = cleanup(api, root, store, args.project, 20)
                    print(json.dumps(result), flush=True)
                    if not result['candidatesRemaining']:
                        break
        elif args.command == 'cleanup':
            print(json.dumps(cleanup(api, root, store, args.project, args.limit)))
        elif args.command == 'policy':
            print(json.dumps({'project': args.project, 'policy': set_policy(api, args.project)}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # 不把 CLI 输出、配置或连接串带入公共日志。
        print('操作停止：' + str(error))
        raise SystemExit(1)
