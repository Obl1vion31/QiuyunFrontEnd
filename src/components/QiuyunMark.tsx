import styles from './QiuyunMark.module.css';

interface Props {
  size?: 24 | 36;
  surface?: 'plain' | 'tile';
}

export default function QiuyunMark({ size = 36, surface = 'plain' }: Props) {
  return <img
    src="/images/brand/qiuyun-mark.svg"
    alt=""
    aria-hidden="true"
    width={size}
    height={size}
    decoding="async"
    data-qiuyun-mark
    className={[styles.mark, size === 24 && styles.small, surface === 'tile' && styles.tile].filter(Boolean).join(' ')}
  />;
}
