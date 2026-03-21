import type { Route } from '../use-hash-route.js';
import styles from './NavTabs.module.css';

interface NavTabsProps {
  active: Route;
  onNavigate: (route: Route) => void;
}

const TABS: Array<{ route: Route; label: string }> = [
  { route: 'deps', label: 'Dependencies' },
  { route: 'licenses', label: 'Licenses' },
  { route: 'graph', label: 'Dependency Graph' },
];

export function NavTabs({ active, onNavigate }: NavTabsProps) {
  return (
    <nav className={styles.nav}>
      {TABS.map((tab) => (
        <button
          key={tab.route}
          className={`${styles.tab} ${active === tab.route ? styles.active : ''}`}
          onClick={() => onNavigate(tab.route)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
