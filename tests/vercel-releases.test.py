"""归档和删除保护测试；远程故障在 API 边界注入。"""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import sys
sys.dont_write_bytecode = True
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/vercel-releases.py'
spec = importlib.util.spec_from_file_location('releases', SCRIPT)
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


def row(identifier, created, state='READY', target='production'):
    return {'uid': identifier, 'created': created, 'state': state, 'target': target}


class ProtectionTests(unittest.TestCase):
    def test_live_old_domain_target_and_rollback_are_kept(self):
        rows = [row('dpl_' + str(i), i) for i in range(8)]
        aliases = [{'alias': 'old.example', 'deploymentId': 'dpl_0'}]
        result = r.protection(rows, aliases, {'targets': {'production': {'id': 'dpl_1'}}, 'lastRollbackTarget': {'id': 'dpl_2'}})
        self.assertEqual(set(result), {'dpl_0', 'dpl_1', 'dpl_2', 'dpl_5', 'dpl_6', 'dpl_7'})

    def test_pending_deployments_do_not_replace_recent_ready_production(self):
        rows = [row('dpl_' + str(i), i) for i in range(5)] + [row('dpl_build', 10, 'BUILDING')]
        result = r.protection(rows, [], {})
        self.assertTrue({'dpl_2', 'dpl_3', 'dpl_4', 'dpl_build'} <= set(result))

    def test_paths_reject_traversal_and_windows_paths(self):
        for path in ['../x', '/x', 'a/../../b', 'C:/secret', 'a\\b']:
            with self.subTest(path=path), self.assertRaises(RuntimeError):
                r.safe_relative(path)

    def test_remote_binary_and_json_encoded_files_are_hash_checked(self):
        data = b'actual bundle\x00\xff'
        expected = hashlib.sha1(data).hexdigest()
        self.assertEqual(r.file_payload(data, expected), data)
        self.assertEqual(r.file_payload(json.dumps({'data': r.base64.b64encode(data).decode()}).encode(), expected), data)
        with self.assertRaises(RuntimeError):
            r.file_payload(b'truncated', expected)


class FakeAPI:
    def __init__(self, sha, payload):
        self.sha, self.payload, self.mutations = sha, payload, []

    def api(self, endpoint, method='GET', body=None):
        self.assert_read(method)
        if '/files' in endpoint:
            leaf = {'name': 'entry.mjs', 'type': 'file', 'mode': 33188, 'uid': hashlib.sha1(self.payload).hexdigest()}
            return [{'name': 'src', 'type': 'directory', 'children': [{'name': '.vercel', 'type': 'directory', 'children': [{'name': 'output', 'type': 'directory', 'children': [leaf]}]}]}]
        if '/env?' in endpoint:
            return {'envs': [{'key': 'PRIVATE_KEY', 'type': 'sensitive', 'value': 'must-not-be-stored'}]}
        return {'projectId': r.PROJECTS['formward'][0], 'readyState': 'READY', 'meta': {'gitCommitSha': self.sha}}

    def assert_read(self, method):
        if method != 'GET':
            self.mutations.append(method)
            raise RuntimeError('Injected failure')

    def raw(self, endpoint):
        return self.payload


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        owner = r.common_root(SCRIPT.parent.parent)
        private = '.tools' if 'qiuyunfrontend' in r.git(owner, 'remote', 'get-url', 'origin').lower() else '.codex'
        parent = owner / private / 'test-artifacts'
        parent.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=parent)
        self.root = Path(self.temp.name)
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        (self.root / 'package.json').write_text('{}')
        subprocess.run(['git', 'add', '.'], cwd=self.root, check=True)
        subprocess.run(['git', '-c', 'user.email=test@example.invalid', '-c', 'user.name=ReleaseTest', 'commit', '-qm', 'fixture'], cwd=self.root, check=True)
        self.sha = r.git(self.root, 'rev-parse', 'HEAD')
        self.store = self.root / '.tools/backups'
        self.store.mkdir(parents=True)
        self.api = FakeAPI(self.sha, b'export default ()=>{};')

    def tearDown(self):
        self.temp.cleanup()

    def test_actual_archive_roundtrip_idempotency_and_corruption(self):
        manifest = r.archive(self.api, self.root, self.store, 'formward', 'dpl_test')
        folder = self.store / 'formward/dpl_test'
        self.assertEqual(r.verify_archive(folder)['files'], manifest['files'])
        self.assertNotIn('must-not-be-stored', (folder / 'environment-keys.json').read_text())
        self.assertEqual(r.archive(self.api, self.root, self.store, 'formward', 'dpl_test'), manifest)
        (folder / 'runtime.tar.gz').write_bytes(b'corrupt')
        with self.assertRaises(RuntimeError):
            r.verify_archive(folder)
        self.assertEqual(self.api.mutations, [])

    def state(self):
        return {'project': 'formward', 'projectId': 'fixture', 'rows': [row('dpl_old', 0), row('dpl_current', 1)],
                'aliases': [{'alias': 'global.formward.top', 'deploymentId': 'dpl_current'}],
                'protected': {'dpl_current': ['live']}, 'candidates': [row('dpl_old', 0)], 'inFlight': [], 'policy': {}}

    def test_missing_archive_prevents_every_delete(self):
        with patch.object(r, 'inventory', return_value=self.state()), self.assertRaises(FileNotFoundError):
            r.cleanup(self.api, self.root, self.store, 'formward', 5)
        self.assertEqual(self.api.mutations, [])

    def test_inflight_prevents_every_delete(self):
        state = self.state() | {'inFlight': ['dpl_build']}
        with patch.object(r, 'inventory', return_value=state), self.assertRaises(RuntimeError):
            r.cleanup(self.api, self.root, self.store, 'formward', 5)
        self.assertEqual(self.api.mutations, [])

    def test_alias_change_prevents_every_delete(self):
        initial = self.state()
        changed = initial | {'aliases': [{'alias': 'global.formward.top', 'deploymentId': 'dpl_old'}]}
        with patch.object(r, 'inventory', side_effect=[initial, changed]), patch.object(r, 'verify_archive', return_value={'deploymentId': 'dpl_current', 'project': 'formward'}), patch.object(r, 'health', return_value=[]), self.assertRaises(RuntimeError):
            r.cleanup(self.api, self.root, self.store, 'formward', 5)
        self.assertEqual(self.api.mutations, [])

    def test_api_delete_failure_stops_batch(self):
        state = self.state()
        with patch.object(r, 'inventory', return_value=state), patch.object(r, 'verify_archive', return_value={'deploymentId': 'dpl_current', 'project': 'formward'}), patch.object(r, 'health', return_value=[]), self.assertRaises(RuntimeError):
            r.cleanup(self.api, self.root, self.store, 'formward', 5)
        self.assertEqual(self.api.mutations, ['DELETE'])

    def test_bad_download_never_becomes_completed_archive(self):
        self.api.raw = lambda endpoint: b'wrong'
        with self.assertRaises(RuntimeError):
            r.archive(self.api, self.root, self.store, 'formward', 'dpl_bad')
        self.assertFalse((self.store / 'formward/dpl_bad').exists())

    def test_identical_database_baselines_share_verified_files(self):
        stages = [self.root / 'stage-one', self.root / 'stage-two']
        ids = []
        for index, stage in enumerate(stages):
            stage.mkdir()
            (stage / 'schema.sql').write_text('\\restrict key' + str(index) + '\nCREATE TABLE example(id int);\n\\unrestrict key' + str(index) + '\n')
            (stage / 'migration-journal.csv').write_text('id,hash\n1,example\n')
            ids.append(r.intern_baseline(self.store, stage))
        self.assertEqual(ids[0], ids[1])
        self.assertEqual((stages[0] / 'schema.sql').stat().st_ino, (stages[1] / 'schema.sql').stat().st_ino)
        (self.store / 'database-baselines' / ids[0] / 'schema.sql').write_text('corrupt')
        stage = self.root / 'stage-three'
        stage.mkdir()
        (stage / 'schema.sql').write_text('\\restrict other\nCREATE TABLE example(id int);\n\\unrestrict other\n')
        (stage / 'migration-journal.csv').write_text('id,hash\n1,example\n')
        with self.assertRaises(RuntimeError):
            r.intern_baseline(self.store, stage)

    def test_default_cleanup_command_never_mutates(self):
        import contextlib
        import io
        with patch.object(sys, 'argv', ['vercel-releases.py', 'cleanup', '--project', 'qiuyun' if 'qiuyunfrontend' in r.git(SCRIPT.parents[1], 'remote', 'get-url', 'origin').lower() else 'formward']), patch.object(r, 'Vercel') as api, patch.object(r, 'inventory', return_value=self.state()), contextlib.redirect_stdout(io.StringIO()):
            r.main()
        api.return_value.api.assert_not_called()


class ActivationTests(unittest.TestCase):
    def test_formward_only_updates_aliases_of_current_gateway(self):
        api = type('API', (), {'exe': 'vercel', 'root': Path('.')})()
        state = {'aliases': [
            {'alias': 'global.formward.top', 'deploymentId': 'dpl_gateway'},
            {'alias': 'formward-ten.vercel.app', 'deploymentId': 'dpl_gateway'},
            {'alias': 'formward-opg.vercel.app', 'deploymentId': 'dpl_legacy'},
        ]}
        with patch.object(r.subprocess, 'run', return_value=type('Result', (), {'returncode': 0})()) as run:
            r.activate(api, 'formward', 'dpl_new', state)
            commands = [call.args[0] for call in run.call_args_list]
            self.assertEqual([c[4] for c in commands], ['global.formward.top', 'formward-ten.vercel.app'])
            self.assertTrue(all(c[1:3] == ['alias', 'set'] for c in commands))

    def test_partial_activation_failure_stops_following_commands(self):
        api = type('API', (), {'exe': 'vercel', 'root': Path('.')})()
        state = {'aliases': [{'alias': 'global.formward.top', 'deploymentId': 'dpl_old'}, {'alias': 'other.example', 'deploymentId': 'dpl_old'}]}
        with patch.object(r.subprocess, 'run', return_value=type('Result', (), {'returncode': 1})()) as run, self.assertRaises(RuntimeError):
            r.activate(api, 'formward', 'dpl_new', state)
        self.assertEqual(run.call_count, 1)

    def test_primary_domain_cannot_be_mistaken_for_vercel_login(self):
        from unittest.mock import MagicMock
        response = MagicMock()
        response.__enter__.return_value = response
        response.url = 'https://vercel.com/login?next=redacted'
        with patch.object(r.urllib.request, 'urlopen', return_value=response), self.assertRaises(RuntimeError):
            r.health('formward')


if __name__ == '__main__':
    unittest.main()
