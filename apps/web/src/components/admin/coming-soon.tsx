import { Badge, Card, EmptyState } from '@snapsell/ui';
import { navItem } from '@/lib/nav';
import { PageHeader } from './page-header';

/** Placeholder for sections delivered in later build phases. */
export function ComingSoon({ href, children }: { href: string; children?: React.ReactNode }) {
  const item = navItem(href)!;
  return (
    <>
      <PageHeader title={item.label} description={item.description} />
      <Card>
        <EmptyState
          icon={item.icon}
          title={`${item.label} is on its way`}
          description={children ?? item.description}
          action={<Badge tone="primary">Planned for phase {item.phase}</Badge>}
        />
      </Card>
    </>
  );
}
