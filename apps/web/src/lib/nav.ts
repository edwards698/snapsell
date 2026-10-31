import {
  Boxes,
  ChartColumn,
  CreditCard,
  House,
  type LucideIcon,
  MessageCircle,
  Package,
  Plug,
  Receipt,
  Server,
  Settings,
  Sparkles,
  Tags,
  Users,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown on placeholder pages and in the command menu. */
  description: string;
  /** Build phase that delivers the page (BUILD_PLAN §15); undefined = available now. */
  phase?: number;
  keywords?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Grouping from BUILD_PLAN §2.5.
export const NAV: NavGroup[] = [
  {
    label: 'Sell',
    items: [
      {
        href: '/admin',
        label: 'Dashboard',
        icon: House,
        description: 'Sales, things that need your attention and setup progress.',
        keywords: ['home'],
      },
      {
        href: '/admin/orders',
        label: 'Orders',
        icon: Receipt,
        description: 'Every website and WhatsApp order, with payment and delivery status.',
      },
      {
        href: '/admin/inbox',
        label: 'Inbox',
        icon: MessageCircle,
        description: 'Customer WhatsApp chats, AI drafts and one-tap takeover.',
        phase: 5,
        keywords: ['whatsapp', 'chat', 'messages'],
      },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      {
        href: '/admin/products',
        label: 'Products',
        icon: Package,
        description: 'Snap a photo to list a product, then manage prices, variants and images.',
      },
      {
        href: '/admin/categories',
        label: 'Categories',
        icon: Tags,
        description: 'Group products so customers can browse your shop.',
      },
      {
        href: '/admin/stock',
        label: 'Stock',
        icon: Boxes,
        description: 'Stock levels, adjustments with reasons, and low-stock warnings.',
        keywords: ['inventory'],
      },
    ],
  },
  {
    label: 'People',
    items: [
      {
        href: '/admin/customers',
        label: 'Customers',
        icon: Users,
        description: 'Customer details, order history and conversations in one place.',
      },
    ],
  },
  {
    label: 'Money',
    items: [
      {
        href: '/admin/payments',
        label: 'Payments',
        icon: CreditCard,
        description: 'DevDraft payment links, verified payments and webhook history.',
      },
      {
        href: '/admin/reports',
        label: 'Reports',
        icon: ChartColumn,
        description: 'Paid sales over time, best sellers and sales by channel.',
        phase: 8,
        keywords: ['sales', 'analytics'],
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        href: '/admin/ai',
        label: 'AI Assistant',
        icon: Sparkles,
        description: 'How the assistant talks, what it may do, and a sandbox to try it.',
        phase: 6,
        keywords: ['gemini', 'bot'],
      },
      {
        href: '/admin/integrations',
        label: 'Integrations',
        icon: Plug,
        description: 'WhatsApp, DevDraft payments and Resend email.',
        keywords: ['whatsapp', 'devdraft', 'resend', 'email'],
      },
      {
        href: '/admin/system',
        label: 'System',
        icon: Server,
        description: 'Server health: database, disk, background jobs and backups.',
        keywords: ['health', 'jobs', 'disk'],
      },
      {
        href: '/admin/settings',
        label: 'Settings',
        icon: Settings,
        description: 'Your account, password and appearance.',
        keywords: ['password', 'account', 'theme'],
      },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((g) => g.items);

/** Bottom tab bar on phones (BUILD_PLAN §2.5); everything else lives under "More". */
export const MOBILE_TABS = ['/admin', '/admin/orders', '/admin/inbox', '/admin/products'];

export function navItem(href: string) {
  return NAV_ITEMS.find((i) => i.href === href);
}

export function isActive(pathname: string, href: string) {
  return href === '/admin'
    ? pathname === '/admin'
    : pathname === href || pathname.startsWith(`${href}/`);
}
