/** Sample shop catalogue for `pnpm seed` – stationery, cables, chargers, laptops and phones. */

export interface SeedProduct {
  name: string;
  category: string;
  description: string;
  colors: [string, string];
  options?: string[];
  variants: Array<{
    values?: Record<string, string>;
    price: number;
    compareAt?: number;
    stock: number;
  }>;
}

export const CATEGORIES = [
  'Stationery',
  'Cables & Adapters',
  'Chargers & Power',
  'Laptops',
  'Phones',
  'Phone Accessories',
] as const;

export const PRODUCTS: SeedProduct[] = [
  // ── Stationery ────────────────────────────────────────────────────────────
  {
    name: 'A4 Exercise Books (Pack of 5)',
    category: 'Stationery',
    description:
      'Pack of five 96-page A4 ruled exercise books. Ideal for school, college or office notes. Thick covers that survive a backpack.',
    colors: ['#1d4ed8', '#1e3a8a'],
    options: ['Ruling'],
    variants: [
      { values: { Ruling: 'Single ruled' }, price: 85, stock: 40 },
      { values: { Ruling: 'Squared' }, price: 85, stock: 28 },
      { values: { Ruling: 'Plain' }, price: 80, stock: 18 },
    ],
  },
  {
    name: 'A5 Softcover Notebook',
    category: 'Stationery',
    description:
      'Pocket-friendly A5 notebook, 80 lined pages, soft matte cover. Fits in a laptop bag or handbag.',
    colors: ['#0f766e', '#134e4a'],
    options: ['Colour'],
    variants: [
      { values: { Colour: 'Navy' }, price: 45, stock: 30 },
      { values: { Colour: 'Forest green' }, price: 45, stock: 22 },
      { values: { Colour: 'Burgundy' }, price: 45, stock: 15 },
    ],
  },
  {
    name: 'Hardcover Journal A5',
    category: 'Stationery',
    description:
      'Cloth-bound A5 journal with 192 cream pages, ribbon bookmark and elastic closure. Great for meeting notes or a personal diary.',
    colors: ['#78350f', '#451a03'],
    variants: [{ price: 120, compareAt: 150, stock: 20 }],
  },
  {
    name: 'Ballpoint Pens (Box of 20)',
    category: 'Stationery',
    description:
      'Smooth-writing 1.0 mm ballpoint pens. Reliable everyday pens for school desks and shop counters.',
    colors: ['#1e40af', '#172554'],
    options: ['Ink'],
    variants: [
      { values: { Ink: 'Blue' }, price: 55, stock: 50 },
      { values: { Ink: 'Black' }, price: 55, stock: 45 },
      { values: { Ink: 'Mixed (10 blue / 10 black)' }, price: 58, stock: 25 },
    ],
  },
  {
    name: 'Gel Pens (Pack of 12)',
    category: 'Stationery',
    description:
      '0.7 mm gel pens with quick-dry ink that won’t smear. Comfortable rubber grip for long writing sessions.',
    colors: ['#7c3aed', '#4c1d95'],
    variants: [{ price: 70, stock: 35 }],
  },
  {
    name: 'HB Pencils (Pack of 12)',
    category: 'Stationery',
    description:
      'Pre-sharpened HB pencils with break-resistant leads. Includes a free sharpener in the pack.',
    colors: ['#ca8a04', '#854d0e'],
    variants: [{ price: 35, stock: 60 }],
  },
  {
    name: 'Erasers & Sharpener Kit',
    category: 'Stationery',
    description:
      'Two soft white erasers and a dual-hole metal sharpener. Clean erasing without tearing the page.',
    colors: ['#64748b', '#334155'],
    variants: [{ price: 25, stock: 40 }],
  },
  {
    name: '30 cm Plastic Ruler',
    category: 'Stationery',
    description:
      'Clear shatter-resistant ruler with cm and inch markings. Bevelled edge for neat underlining.',
    colors: ['#0ea5e9', '#0369a1'],
    variants: [{ price: 15, stock: 80 }],
  },
  {
    name: 'Desktop Stapler Set',
    category: 'Stationery',
    description:
      'Full-strip stapler with 1,000 staples and a staple remover. Opens flat for bulletin boards.',
    colors: ['#475569', '#1e293b'],
    variants: [{ price: 95, stock: 18 }],
  },
  {
    name: 'Sticky Notes Multipack',
    category: 'Stationery',
    description:
      '12 pads of sticky notes in bright colours (76 × 76 mm, 100 sheets each). Stick firmly and remove cleanly.',
    colors: ['#f59e0b', '#b45309'],
    variants: [{ price: 65, stock: 32 }],
  },
  {
    name: 'Whiteboard Markers (Pack of 8)',
    category: 'Stationery',
    description:
      'Low-odour dry-erase markers with bullet tips. Eight colours; caps have a built-in eraser for quick corrections.',
    colors: ['#dc2626', '#7f1d1d'],
    variants: [{ price: 75, stock: 24 }],
  },
  {
    name: 'Manila File Folders (Pack of 20)',
    category: 'Stationery',
    description:
      'Foolscap manila folders with tabs for labelling. Tough enough for daily filing in a busy office.',
    colors: ['#d97706', '#92400e'],
    variants: [{ price: 90, stock: 20 }],
  },
  {
    name: 'Glue Stick Multipack (6)',
    category: 'Stationery',
    description:
      'Non-toxic washable glue sticks, 36 g each. Smooth application for crafts, scrapbooks and school projects.',
    colors: ['#ec4899', '#9d174d'],
    variants: [{ price: 48, stock: 40 }],
  },
  {
    name: 'Correction Tape (Pack of 4)',
    category: 'Stationery',
    description:
      'Dry correction tape that writes instantly – no waiting to dry. Covers cleanly over ink and pencil.',
    colors: ['#14b8a6', '#0f766e'],
    variants: [{ price: 42, stock: 30 }],
  },

  // ── Cables & Adapters ─────────────────────────────────────────────────────
  {
    name: 'USB-C to USB-C Cable',
    category: 'Cables & Adapters',
    description:
      'Braided USB-C cable supporting fast charge (up to 60 W) and data sync. Reinforced strain relief at both ends.',
    colors: ['#111827', '#374151'],
    options: ['Length'],
    variants: [
      { values: { Length: '1 m' }, price: 75, stock: 40 },
      { values: { Length: '2 m' }, price: 95, stock: 35 },
      { values: { Length: '3 m' }, price: 120, stock: 18 },
    ],
  },
  {
    name: 'USB-C to Lightning Cable',
    category: 'Cables & Adapters',
    description:
      'MFi-style USB-C to Lightning cable for iPhone and iPad. Supports fast charging with a compatible USB-C power adapter.',
    colors: ['#e5e7eb', '#6b7280'],
    options: ['Length'],
    variants: [
      { values: { Length: '1 m' }, price: 110, stock: 28 },
      { values: { Length: '2 m' }, price: 140, stock: 20 },
    ],
  },
  {
    name: 'Micro-USB Cable',
    category: 'Cables & Adapters',
    description:
      'Durable Micro-USB charging and sync cable for older Android phones, power banks, speakers and accessories.',
    colors: ['#1f2937', '#4b5563'],
    options: ['Length'],
    variants: [
      { values: { Length: '1 m' }, price: 45, stock: 50 },
      { values: { Length: '2 m' }, price: 60, stock: 35 },
    ],
  },
  {
    name: 'USB-A to USB-C Cable',
    category: 'Cables & Adapters',
    description:
      'Classic USB-A to USB-C cable for charging phones and tablets from a laptop or wall adapter with a USB-A port.',
    colors: ['#0f172a', '#334155'],
    options: ['Length'],
    variants: [
      { values: { Length: '1 m' }, price: 55, stock: 45 },
      { values: { Length: '2 m' }, price: 70, stock: 30 },
    ],
  },
  {
    name: 'USB-A to Micro-USB Cable',
    category: 'Cables & Adapters',
    description:
      'USB-A to Micro-USB cable for feature phones, older tablets, Bluetooth speakers and budget power banks.',
    colors: ['#374151', '#111827'],
    variants: [{ price: 40, stock: 55 }],
  },
  {
    name: '3-in-1 Charging Cable',
    category: 'Cables & Adapters',
    description:
      'One cable, three tips: USB-C, Lightning and Micro-USB on a retractable reel. Handy for travel and shared desks.',
    colors: ['#2563eb', '#1e3a8a'],
    variants: [{ price: 130, compareAt: 160, stock: 22 }],
  },
  {
    name: 'HDMI Cable 2.0',
    category: 'Cables & Adapters',
    description:
      'High-speed HDMI 2.0 cable for 4K@60 Hz, HDR and ARC. Connect laptops, consoles or Fire sticks to a TV or monitor.',
    colors: ['#18181b', '#3f3f46'],
    options: ['Length'],
    variants: [
      { values: { Length: '1.5 m' }, price: 85, stock: 25 },
      { values: { Length: '3 m' }, price: 110, stock: 18 },
      { values: { Length: '5 m' }, price: 145, stock: 10 },
    ],
  },
  {
    name: 'USB-C Hub 7-in-1',
    category: 'Cables & Adapters',
    description:
      'Aluminium USB-C hub: HDMI 4K, USB-A ×3, USB-C PD pass-through, SD and microSD. Turns one laptop port into a full desk setup.',
    colors: ['#71717a', '#27272a'],
    variants: [{ price: 480, compareAt: 550, stock: 12 }],
  },
  {
    name: 'USB-C to HDMI Adapter',
    category: 'Cables & Adapters',
    description:
      'Plug-and-play USB-C to HDMI adapter for presenting from a laptop or phone on a projector or TV. Supports 4K output.',
    colors: ['#52525b', '#18181b'],
    variants: [{ price: 160, stock: 20 }],
  },
  {
    name: '3.5 mm Aux Cable',
    category: 'Cables & Adapters',
    description:
      'Braided 3.5 mm male-to-male audio cable for cars, speakers and headphones. Gold-plated connectors for a clean signal.',
    colors: ['#292524', '#57534e'],
    options: ['Length'],
    variants: [
      { values: { Length: '1 m' }, price: 35, stock: 40 },
      { values: { Length: '1.5 m' }, price: 45, stock: 28 },
    ],
  },
  {
    name: 'OTG Adapter USB-C',
    category: 'Cables & Adapters',
    description:
      'USB-C OTG adapter to connect flash drives, keyboards or MIDI controllers to a phone or tablet.',
    colors: ['#3f3f46', '#09090b'],
    variants: [{ price: 55, stock: 30 }],
  },

  // ── Chargers & Power ──────────────────────────────────────────────────────
  {
    name: '20W USB-C Wall Charger',
    category: 'Chargers & Power',
    description:
      'Compact 20 W USB-C PD wall charger. Fast-charges recent iPhones and Android phones. Includes a 1 m USB-C cable.',
    colors: ['#f8fafc', '#94a3b8'],
    variants: [{ price: 180, stock: 35 }],
  },
  {
    name: '65W GaN Dual Charger',
    category: 'Chargers & Power',
    description:
      'Small GaN charger with USB-C (65 W) and USB-A ports. Charge a laptop and phone from one plug. Foldable pins for travel.',
    colors: ['#0f172a', '#334155'],
    variants: [{ price: 420, compareAt: 480, stock: 15 }],
  },
  {
    name: '100W USB-C Laptop Charger',
    category: 'Chargers & Power',
    description:
      '100 W USB-C PD charger for USB-C laptops (Dell, HP, Lenovo, MacBook). Replaces bulky OEM bricks with one compact unit.',
    colors: ['#1e293b', '#64748b'],
    variants: [{ price: 550, stock: 10 }],
  },
  {
    name: 'Dual-Port USB Wall Charger',
    category: 'Chargers & Power',
    description:
      '18 W dual USB-A wall charger with Smart IC that detects device type. Ideal for bedrooms and guest rooms.',
    colors: ['#e2e8f0', '#64748b'],
    variants: [{ price: 95, stock: 40 }],
  },
  {
    name: 'Car Charger Dual Port',
    category: 'Chargers & Power',
    description:
      '36 W car charger with USB-C PD and USB-A QC ports. Charges two phones on the road without slow trickle charging.',
    colors: ['#111827', '#4b5563'],
    variants: [{ price: 140, stock: 25 }],
  },
  {
    name: '15W Wireless Charging Pad',
    category: 'Chargers & Power',
    description:
      'Qi wireless pad up to 15 W. Soft LED indicator, foreign-object detection, and a non-slip surface. Case-friendly up to 3 mm.',
    colors: ['#27272a', '#a1a1aa'],
    variants: [{ price: 220, stock: 18 }],
  },
  {
    name: 'Power Bank 10,000 mAh',
    category: 'Chargers & Power',
    description:
      'Slim 10,000 mAh power bank with USB-C in/out and one USB-A port. About two full phone charges. Pocket-sized for commuting.',
    colors: ['#1d4ed8', '#1e3a8a'],
    options: ['Colour'],
    variants: [
      { values: { Colour: 'Black' }, price: 280, stock: 30 },
      { values: { Colour: 'White' }, price: 280, stock: 18 },
      { values: { Colour: 'Blue' }, price: 280, stock: 12 },
    ],
  },
  {
    name: 'Power Bank 20,000 mAh',
    category: 'Chargers & Power',
    description:
      'High-capacity 20,000 mAh bank with 22.5 W fast charge, dual USB-A and USB-C PD. Keeps a phone and earbuds topped up all weekend.',
    colors: ['#0f766e', '#115e59'],
    variants: [{ price: 420, compareAt: 480, stock: 20 }],
  },
  {
    name: 'Power Bank 30,000 mAh',
    category: 'Chargers & Power',
    description:
      '30,000 mAh power station with LED display, 65 W USB-C PD laptop output and three phone ports. For travel, fieldwork or load-shedding.',
    colors: ['#18181b', '#52525b'],
    variants: [{ price: 680, stock: 8 }],
  },
  {
    name: 'Multi-Plug Surge Protector',
    category: 'Chargers & Power',
    description:
      '6-outlet surge-protected extension with 2 USB ports and a 3 m cord. Protects TVs, routers and chargers from voltage spikes.',
    colors: ['#ffffff', '#94a3b8'],
    variants: [{ price: 250, stock: 16 }],
  },

  // ── Laptops (many configs) ────────────────────────────────────────────────
  {
    name: 'HP 15s Celeron 4/128',
    category: 'Laptops',
    description:
      'Affordable 15.6" HP laptop for browsing, WhatsApp Web and schoolwork. Intel Celeron, 4 GB RAM, 128 GB SSD, Windows 11. Expandable storage via SD card.',
    colors: ['#64748b', '#1e293b'],
    options: ['Colour'],
    variants: [
      { values: { Colour: 'Silver' }, price: 4200, stock: 6 },
      { values: { Colour: 'Black' }, price: 4200, stock: 4 },
    ],
  },
  {
    name: 'HP 15s Intel i3 8/256',
    category: 'Laptops',
    description:
      'Everyday 15.6" Full HD HP. Intel Core i3, 8 GB RAM, 256 GB SSD. Smooth for Zoom, Excel, Chrome with many tabs and light photo edits.',
    colors: ['#94a3b8', '#334155'],
    options: ['RAM / Storage'],
    variants: [
      { values: { 'RAM / Storage': '8 GB / 256 GB' }, price: 7800, stock: 5 },
      { values: { 'RAM / Storage': '8 GB / 512 GB' }, price: 8600, stock: 3 },
      { values: { 'RAM / Storage': '16 GB / 512 GB' }, price: 9800, compareAt: 10500, stock: 2 },
    ],
  },
  {
    name: 'HP Pavilion 15 Intel i5',
    category: 'Laptops',
    description:
      'Pavilion 15 with Intel Core i5, vivid Full HD IPS display, backlit keyboard and Bang & Olufsen tuning. Strong all-rounder for work and study.',
    colors: ['#0ea5e9', '#0c4a6e'],
    options: ['RAM / Storage'],
    variants: [
      { values: { 'RAM / Storage': '8 GB / 512 GB' }, price: 12500, stock: 4 },
      { values: { 'RAM / Storage': '16 GB / 512 GB' }, price: 14200, stock: 3 },
      { values: { 'RAM / Storage': '16 GB / 1 TB' }, price: 15800, stock: 2 },
    ],
  },
  {
    name: 'HP EliteBook 840 G8',
    category: 'Laptops',
    description:
      'Business ultraportable: 14" FHD, Intel Core i5 vPro, 16 GB RAM, 512 GB SSD, fingerprint reader and spill-resistant keyboard. Built for long office days.',
    colors: ['#78716c', '#292524'],
    variants: [{ price: 18500, compareAt: 21000, stock: 3 }],
  },
  {
    name: 'Dell Inspiron 15 Intel i5',
    category: 'Laptops',
    description:
      'Dell Inspiron 15.6" FHD with Intel Core i5, dual speakers and a numeric keypad. Reliable for students and small-business bookkeeping.',
    colors: ['#1e3a8a', '#172554'],
    options: ['RAM / Storage'],
    variants: [
      { values: { 'RAM / Storage': '8 GB / 256 GB' }, price: 11200, stock: 4 },
      { values: { 'RAM / Storage': '8 GB / 512 GB' }, price: 12400, stock: 4 },
      { values: { 'RAM / Storage': '16 GB / 512 GB' }, price: 13800, stock: 2 },
    ],
  },
  {
    name: 'Dell Inspiron 15 Intel i7',
    category: 'Laptops',
    description:
      'Higher-spec Inspiron with Intel Core i7, 16 GB RAM and fast SSD. Handles multi-track video drafts, large spreadsheets and many browser profiles.',
    colors: ['#1d4ed8', '#1e3a8a'],
    options: ['RAM / Storage'],
    variants: [
      { values: { 'RAM / Storage': '16 GB / 512 GB' }, price: 16800, stock: 3 },
      { values: { 'RAM / Storage': '16 GB / 1 TB' }, price: 18500, stock: 2 },
      { values: { 'RAM / Storage': '32 GB / 1 TB' }, price: 21500, stock: 1 },
    ],
  },
  {
    name: 'Dell XPS 13 OLED',
    category: 'Laptops',
    description:
      'Premium 13.4" OLED InfinityEdge Dell XPS. Intel Core Ultra, 16 GB RAM, 512 GB SSD, near-borderless screen. Light enough for daily commute.',
    colors: ['#e5e7eb', '#6b7280'],
    variants: [{ price: 28500, stock: 2 }],
  },
  {
    name: 'Lenovo IdeaPad 3 Intel i3',
    category: 'Laptops',
    description:
      'Budget-friendly IdeaPad 3: 15.6" FHD, Intel Core i3, 8 GB RAM, 256 GB SSD. Solid starter laptop for forms, email and online classes.',
    colors: ['#365314', '#1a2e05'],
    options: ['RAM / Storage'],
    variants: [
      { values: { 'RAM / Storage': '8 GB / 256 GB' }, price: 7200, stock: 6 },
      { values: { 'RAM / Storage': '8 GB / 512 GB' }, price: 8100, stock: 3 },
    ],
  },
  {
    name: 'Lenovo IdeaPad 3 Intel i5',
    category: 'Laptops',
    description:
      'IdeaPad 3 with Intel Core i5, 8–16 GB RAM options and up to 512 GB SSD. Quiet cooling and a full-size keyboard with number pad.',
    colors: ['#4d7c0f', '#365314'],
    options: ['RAM / Storage'],
    variants: [
      { values: { 'RAM / Storage': '8 GB / 512 GB' }, price: 10500, stock: 5 },
      { values: { 'RAM / Storage': '16 GB / 512 GB' }, price: 11800, stock: 3 },
    ],
  },
  {
    name: 'Lenovo ThinkPad E14 Gen 5',
    category: 'Laptops',
    description:
      'Classic ThinkPad keyboard on a 14" business laptop. AMD Ryzen 5 / Intel i5 options, military-grade durability, TrackPoint and long battery life.',
    colors: ['#171717', '#525252'],
    options: ['Config'],
    variants: [
      { values: { Config: 'Ryzen 5 / 16 GB / 512 GB' }, price: 15500, stock: 3 },
      { values: { Config: 'Intel i5 / 16 GB / 512 GB' }, price: 16200, stock: 2 },
      { values: { Config: 'Intel i7 / 16 GB / 1 TB' }, price: 19800, stock: 1 },
    ],
  },
  {
    name: 'Lenovo Legion 5 Gaming',
    category: 'Laptops',
    description:
      '15.6" 165 Hz Legion gaming laptop with RTX 4060, AMD Ryzen 7, 16 GB RAM and 1 TB SSD. Coldfront cooling for long Fortnite and League sessions.',
    colors: ['#14532d', '#052e16'],
    options: ['GPU / Storage'],
    variants: [
      { values: { 'GPU / Storage': 'RTX 4050 / 512 GB' }, price: 24500, stock: 2 },
      { values: { 'GPU / Storage': 'RTX 4060 / 1 TB' }, price: 28500, stock: 2 },
    ],
  },
  {
    name: 'Acer Aspire 3 Ryzen 5',
    category: 'Laptops',
    description:
      'Acer Aspire 3 with AMD Ryzen 5, 8 GB RAM, 512 GB SSD and a sharp 15.6" FHD panel. Good value for coding bootcamps and office suites.',
    colors: ['#44403c', '#1c1917'],
    options: ['RAM / Storage'],
    variants: [
      { values: { 'RAM / Storage': '8 GB / 512 GB' }, price: 9800, stock: 4 },
      { values: { 'RAM / Storage': '16 GB / 512 GB' }, price: 11200, stock: 3 },
    ],
  },
  {
    name: 'Acer Aspire 5 Intel i5',
    category: 'Laptops',
    description:
      'Aspire 5 with Intel Core i5, fingerprint login, backlit keyboard and Wi‑Fi 6. Ready for hybrid work out of the box.',
    colors: ['#57534e', '#292524'],
    options: ['RAM / Storage'],
    variants: [
      { values: { 'RAM / Storage': '8 GB / 512 GB' }, price: 11800, stock: 4 },
      { values: { 'RAM / Storage': '16 GB / 512 GB' }, price: 13200, stock: 2 },
      { values: { 'RAM / Storage': '16 GB / 1 TB' }, price: 14800, stock: 1 },
    ],
  },
  {
    name: 'Acer Nitro 5 Gaming',
    category: 'Laptops',
    description:
      'Nitro 5 15.6" 144 Hz gaming machine with RTX 4050, Intel Core i5, 16 GB RAM. RGB keyboard and twin fans for cooler play.',
    colors: ['#000000', '#b91c1c'],
    variants: [{ price: 22500, compareAt: 24900, stock: 3 }],
  },
  {
    name: 'ASUS VivoBook 15 OLED',
    category: 'Laptops',
    description:
      'VivoBook 15 with vivid OLED display, Intel Core i5, 16 GB RAM and 512 GB SSD. Colour-accurate screen for design students and content creators.',
    colors: ['#fef3c7', '#d97706'],
    options: ['Colour'],
    variants: [
      { values: { Colour: 'Silver' }, price: 14500, stock: 3 },
      { values: { Colour: 'Quiet Blue' }, price: 14500, stock: 2 },
    ],
  },
  {
    name: 'ASUS TUF Gaming A15',
    category: 'Laptops',
    description:
      'Tough TUF A15: Ryzen 7, RTX 4060, 16 GB RAM, 1 TB SSD, 144 Hz display. Military-grade chassis that survives campus and LAN parties.',
    colors: ['#365314', '#14532d'],
    options: ['RAM / Storage'],
    variants: [
      { values: { 'RAM / Storage': '16 GB / 512 GB' }, price: 24800, stock: 2 },
      { values: { 'RAM / Storage': '16 GB / 1 TB' }, price: 26800, stock: 2 },
      { values: { 'RAM / Storage': '32 GB / 1 TB' }, price: 29800, stock: 1 },
    ],
  },
  {
    name: 'ASUS Zenbook 14 OLED',
    category: 'Laptops',
    description:
      'Thin Zenbook 14 with 2.8K OLED, Intel Core Ultra, 16 GB RAM, 1 TB SSD and all-day battery. Premium lid and NumberPad 2.0 touchpad.',
    colors: ['#e0e7ff', '#4338ca'],
    variants: [{ price: 26500, stock: 2 }],
  },
  {
    name: 'Apple MacBook Air 13 M2',
    category: 'Laptops',
    description:
      'MacBook Air 13" with M2 chip – silent fanless design, Liquid Retina display, MagSafe charging. Ideal for creators who live in Safari, Pages and Final Cut.',
    colors: ['#c4b5fd', '#6d28d9'],
    options: ['Memory / Storage'],
    variants: [
      { values: { 'Memory / Storage': '8 GB / 256 GB' }, price: 18500, stock: 3 },
      { values: { 'Memory / Storage': '8 GB / 512 GB' }, price: 21500, stock: 2 },
      { values: { 'Memory / Storage': '16 GB / 512 GB' }, price: 24500, stock: 2 },
    ],
  },
  {
    name: 'Apple MacBook Air 15 M3',
    category: 'Laptops',
    description:
      'Larger 15" MacBook Air with M3, spacious Liquid Retina screen and up to 18-hour battery. Room for spreadsheets and timelines side by side.',
    colors: ['#a5b4fc', '#4338ca'],
    options: ['Memory / Storage'],
    variants: [
      { values: { 'Memory / Storage': '8 GB / 256 GB' }, price: 24500, stock: 2 },
      { values: { 'Memory / Storage': '16 GB / 512 GB' }, price: 29500, stock: 2 },
    ],
  },
  {
    name: 'Apple MacBook Pro 14 M3',
    category: 'Laptops',
    description:
      '14" MacBook Pro with M3 Pro, Liquid Retina XDR, HDMI and SDXC. Built for video editors, developers and music producers who need sustained power.',
    colors: ['#57534e', '#1c1917'],
    options: ['Memory / Storage'],
    variants: [
      { values: { 'Memory / Storage': '18 GB / 512 GB' }, price: 38500, stock: 1 },
      { values: { 'Memory / Storage': '18 GB / 1 TB' }, price: 42500, stock: 1 },
    ],
  },
  {
    name: 'Microsoft Surface Laptop 5',
    category: 'Laptops',
    description:
      '13.5" PixelSense touchscreen Surface Laptop, Intel Core i5/i7, Alcantara keyboard. Elegant Windows machine for presentations and note-taking with Surface Pen (sold separately).',
    colors: ['#78716c', '#44403c'],
    options: ['Config'],
    variants: [
      { values: { Config: 'i5 / 8 GB / 256 GB' }, price: 19800, stock: 2 },
      { values: { Config: 'i7 / 16 GB / 512 GB' }, price: 25500, stock: 1 },
    ],
  },
  {
    name: 'Chromebook Acer 14',
    category: 'Laptops',
    description:
      'Lightweight Chromebook for Google Workspace, Zoom and classroom apps. Boots in seconds, updates automatically, and lasts a full school day on a charge.',
    colors: ['#fbbf24', '#b45309'],
    variants: [{ price: 4800, stock: 8 }],
  },

  // ── Phones (assorted) ─────────────────────────────────────────────────────
  {
    name: 'Samsung Galaxy A15',
    category: 'Phones',
    description:
      'Entry Galaxy with 6.5" Super AMOLED, 50 MP camera and a big 5,000 mAh battery. Clean One UI – perfect first smartphone upgrade.',
    colors: ['#1e3a8a', '#172554'],
    options: ['Storage', 'Colour'],
    variants: [
      { values: { Storage: '128 GB', Colour: 'Blue Black' }, price: 2800, stock: 10 },
      { values: { Storage: '128 GB', Colour: 'Light Blue' }, price: 2800, stock: 6 },
      { values: { Storage: '256 GB', Colour: 'Blue Black' }, price: 3200, stock: 4 },
    ],
  },
  {
    name: 'Samsung Galaxy A25 5G',
    category: 'Phones',
    description:
      'Mid-range A25 with 120 Hz Super AMOLED, 50 MP OIS camera and 5G. Smooth scrolling and sharp outdoor visibility.',
    colors: ['#4c1d95', '#2e1065'],
    options: ['Storage'],
    variants: [
      { values: { Storage: '128 GB' }, price: 4200, stock: 7 },
      { values: { Storage: '256 GB' }, price: 4800, stock: 4 },
    ],
  },
  {
    name: 'Samsung Galaxy A35 5G',
    category: 'Phones',
    description:
      'A35 with Gorilla Glass Victus+, IP67, 120 Hz AMOLED and a capable triple camera. Feels premium without flagship pricing.',
    colors: ['#831843', '#500724'],
    options: ['Storage', 'Colour'],
    variants: [
      { values: { Storage: '128 GB', Colour: 'Awesome Lilac' }, price: 5800, stock: 5 },
      { values: { Storage: '256 GB', Colour: 'Awesome Navy' }, price: 6500, stock: 4 },
      { values: { Storage: '256 GB', Colour: 'Awesome Lilac' }, price: 6500, stock: 3 },
    ],
  },
  {
    name: 'Samsung Galaxy A55 5G',
    category: 'Phones',
    description:
      'Top of the A-series: brighter AMOLED, Exynos 1480, IP67 and 7 years of OS updates. A long-term daily driver.',
    colors: ['#0e7490', '#164e63'],
    options: ['Storage'],
    variants: [
      { values: { Storage: '128 GB' }, price: 7500, stock: 4 },
      { values: { Storage: '256 GB' }, price: 8400, stock: 3 },
    ],
  },
  {
    name: 'Samsung Galaxy S23 FE',
    category: 'Phones',
    description:
      'Fan Edition flagship features: 120 Hz Dynamic AMOLED, triple camera with 3× optical zoom, wireless charging. Flagship feel for less.',
    colors: ['#365314', '#1a2e05'],
    options: ['Storage', 'Colour'],
    variants: [
      { values: { Storage: '128 GB', Colour: 'Mint' }, price: 9800, stock: 3 },
      { values: { Storage: '256 GB', Colour: 'Graphite' }, price: 10800, stock: 3 },
      { values: { Storage: '256 GB', Colour: 'Mint' }, price: 10800, stock: 2 },
    ],
  },
  {
    name: 'Samsung Galaxy S24',
    category: 'Phones',
    description:
      'Flagship S24 with Galaxy AI, bright Dynamic AMOLED 2X, Snapdragon 8 Gen 3 for Galaxy and titanium frame. Seven years of updates promised.',
    colors: ['#1e293b', '#0f172a'],
    options: ['Storage', 'Colour'],
    variants: [
      { values: { Storage: '128 GB', Colour: 'Onyx Black' }, price: 14500, stock: 2 },
      { values: { Storage: '256 GB', Colour: 'Marble Gray' }, price: 15800, stock: 2 },
      { values: { Storage: '256 GB', Colour: 'Cobalt Violet' }, price: 15800, stock: 1 },
    ],
  },
  {
    name: 'Samsung Galaxy S24 Ultra',
    category: 'Phones',
    description:
      'S24 Ultra with built-in S Pen, 200 MP camera, 100× Space Zoom and titanium build. The productivity flagship for power users.',
    colors: ['#44403c', '#1c1917'],
    options: ['Storage'],
    variants: [
      { values: { Storage: '256 GB' }, price: 24500, stock: 2 },
      { values: { Storage: '512 GB' }, price: 27500, stock: 1 },
    ],
  },
  {
    name: 'Apple iPhone 11',
    category: 'Phones',
    description:
      'Reliable iPhone 11 with dual camera, Liquid Retina LCD and all-day battery. Still a strong choice for iMessage, FaceTime and the App Store.',
    colors: ['#6b7280', '#111827'],
    options: ['Storage', 'Colour'],
    variants: [
      { values: { Storage: '64 GB', Colour: 'Black' }, price: 4500, stock: 4 },
      { values: { Storage: '128 GB', Colour: 'White' }, price: 5200, stock: 3 },
      { values: { Storage: '128 GB', Colour: 'Purple' }, price: 5200, stock: 2 },
    ],
  },
  {
    name: 'Apple iPhone 12',
    category: 'Phones',
    description:
      'iPhone 12 with OLED Super Retina XDR, Ceramic Shield and MagSafe. Compact 5G iPhone that still feels modern.',
    colors: ['#3b82f6', '#1e3a8a'],
    options: ['Storage', 'Colour'],
    variants: [
      { values: { Storage: '64 GB', Colour: 'Blue' }, price: 6200, stock: 3 },
      { values: { Storage: '128 GB', Colour: 'Black' }, price: 7000, stock: 3 },
      { values: { Storage: '128 GB', Colour: 'Green' }, price: 7000, stock: 2 },
    ],
  },
  {
    name: 'Apple iPhone 13',
    category: 'Phones',
    description:
      'iPhone 13 with brighter OLED, cinematic mode video and excellent battery life. Dual camera with sensor-shift stabilisation.',
    colors: ['#f97316', '#9a3412'],
    options: ['Storage', 'Colour'],
    variants: [
      { values: { Storage: '128 GB', Colour: 'Midnight' }, price: 8500, stock: 4 },
      { values: { Storage: '128 GB', Colour: 'Starlight' }, price: 8500, stock: 3 },
      { values: { Storage: '256 GB', Colour: 'Blue' }, price: 9800, stock: 2 },
    ],
  },
  {
    name: 'Apple iPhone 14',
    category: 'Phones',
    description:
      'iPhone 14 with crash detection, improved main camera and Action mode video. Same beloved size as the 13, with better low-light shots.',
    colors: ['#e11d48', '#9f1239'],
    options: ['Storage', 'Colour'],
    variants: [
      { values: { Storage: '128 GB', Colour: 'Midnight' }, price: 11200, stock: 3 },
      { values: { Storage: '128 GB', Colour: 'Purple' }, price: 11200, stock: 2 },
      { values: { Storage: '256 GB', Colour: 'Starlight' }, price: 12800, stock: 2 },
    ],
  },
  {
    name: 'Apple iPhone 15',
    category: 'Phones',
    description:
      'iPhone 15 with USB-C, 48 MP main camera, Dynamic Island and a tough Colour-infused glass back. The current mainstream iPhone.',
    colors: ['#0d9488', '#115e59'],
    options: ['Storage', 'Colour'],
    variants: [
      { values: { Storage: '128 GB', Colour: 'Black' }, price: 15500, stock: 3 },
      { values: { Storage: '128 GB', Colour: 'Blue' }, price: 15500, stock: 2 },
      { values: { Storage: '256 GB', Colour: 'Pink' }, price: 17500, stock: 2 },
      { values: { Storage: '256 GB', Colour: 'Black' }, price: 17500, stock: 1 },
    ],
  },
  {
    name: 'Apple iPhone 15 Pro',
    category: 'Phones',
    description:
      'Titanium iPhone 15 Pro with A17 Pro, Action button, pro camera system with telephoto zoom, and USB-C 10 Gbps. For creators who edit on device.',
    colors: ['#a8a29e', '#44403c'],
    options: ['Storage'],
    variants: [
      { values: { Storage: '128 GB' }, price: 21500, stock: 2 },
      { values: { Storage: '256 GB' }, price: 23800, stock: 2 },
      { values: { Storage: '512 GB' }, price: 27500, stock: 1 },
    ],
  },
  {
    name: 'Tecno Spark 20',
    category: 'Phones',
    description:
      'Popular Tecno Spark with a large HD+ screen, 50 MP camera and 5000 mAh battery. Great value for social media, WhatsApp and mobile money.',
    colors: ['#7c3aed', '#4c1d95'],
    options: ['Storage'],
    variants: [
      { values: { Storage: '128 GB' }, price: 2200, stock: 12 },
      { values: { Storage: '256 GB' }, price: 2600, stock: 8 },
    ],
  },
  {
    name: 'Tecno Camon 30',
    category: 'Phones',
    description:
      'Camon 30 camera phone with a bright AMOLED, 50 MP portrait optics and fast charging. Built for creators who shoot Reels and TikToks.',
    colors: ['#db2777', '#9d174d'],
    options: ['Storage', 'Colour'],
    variants: [
      { values: { Storage: '256 GB', Colour: 'Basaltic Dark' }, price: 4500, stock: 6 },
      { values: { Storage: '256 GB', Colour: 'Uyuni Blue' }, price: 4500, stock: 4 },
      { values: { Storage: '512 GB', Colour: 'Basaltic Dark' }, price: 5200, stock: 3 },
    ],
  },
  {
    name: 'Tecno Phantom V Fold',
    category: 'Phones',
    description:
      'Foldable Tecno Phantom with outer cover screen and large inner tablet display. Multitask email, docs and video on one device.',
    colors: ['#1f2937', '#111827'],
    variants: [{ price: 18500, stock: 1 }],
  },
  {
    name: 'Infinix Hot 40',
    category: 'Phones',
    description:
      'Hot 40 with 6.78" 120 Hz display, 5000 mAh battery and fun Aura light. Strong mid-budget pick for gaming and streaming.',
    colors: ['#ea580c', '#9a3412'],
    options: ['Storage'],
    variants: [
      { values: { Storage: '128 GB' }, price: 2400, stock: 10 },
      { values: { Storage: '256 GB' }, price: 2800, stock: 7 },
    ],
  },
  {
    name: 'Infinix Note 40',
    category: 'Phones',
    description:
      'Note 40 with AMOLED, 45 W fast charge and wireless charging – rare at this price. Smooth for multitasking and mobile photography.',
    colors: ['#0891b2', '#155e75'],
    options: ['Storage'],
    variants: [
      { values: { Storage: '256 GB' }, price: 3800, stock: 6 },
      { values: { Storage: '256 GB + 8 GB RAM' }, price: 4200, stock: 4 },
    ],
  },
  {
    name: 'Infinix GT 20 Pro',
    category: 'Phones',
    description:
      'Gaming-focused Infinix with high refresh AMOLED, vapour cooling and customisable RGB. Tuned for PUBG and Free Fire.',
    colors: ['#166534', '#052e16'],
    variants: [{ price: 5500, compareAt: 6200, stock: 4 }],
  },
  {
    name: 'Xiaomi Redmi 13C',
    category: 'Phones',
    description:
      'Affordable Redmi with a big screen, 50 MP camera and expandable storage. Dependable for calls, WhatsApp and YouTube.',
    colors: ['#2563eb', '#1e40af'],
    options: ['Storage'],
    variants: [
      { values: { Storage: '128 GB' }, price: 2100, stock: 14 },
      { values: { Storage: '256 GB' }, price: 2500, stock: 8 },
    ],
  },
  {
    name: 'Xiaomi Redmi Note 13',
    category: 'Phones',
    description:
      'Note 13 with AMOLED 120 Hz, 108 MP camera and 33 W charging. The crowd-favourite balance of screen, battery and price.',
    colors: ['#0f766e', '#134e4a'],
    options: ['Storage', 'Colour'],
    variants: [
      { values: { Storage: '128 GB', Colour: 'Midnight Black' }, price: 3500, stock: 8 },
      { values: { Storage: '256 GB', Colour: 'Ice Blue' }, price: 4000, stock: 5 },
      { values: { Storage: '256 GB', Colour: 'Midnight Black' }, price: 4000, stock: 5 },
    ],
  },
  {
    name: 'Xiaomi Redmi Note 13 Pro',
    category: 'Phones',
    description:
      'Note 13 Pro with curved AMOLED, 200 MP OIS camera and IP54. Flagship-style photos without the flagship bill.',
    colors: ['#7c3aed', '#5b21b6'],
    options: ['Storage'],
    variants: [
      { values: { Storage: '256 GB' }, price: 5200, stock: 4 },
      { values: { Storage: '512 GB' }, price: 6000, stock: 2 },
    ],
  },
  {
    name: 'Xiaomi 14T',
    category: 'Phones',
    description:
      'Xiaomi 14T co-engineered with Leica optics, bright CrystalRes AMOLED and IP68. Serious camera phone for travel and content.',
    colors: ['#0f172a', '#334155'],
    options: ['Storage'],
    variants: [
      { values: { Storage: '256 GB' }, price: 9800, stock: 3 },
      { values: { Storage: '512 GB' }, price: 11200, stock: 2 },
    ],
  },
  {
    name: 'OPPO A78',
    category: 'Phones',
    description:
      'OPPO A78 with 67 W SUPERVOOC charging, AMOLED display and dual stereo speakers. From empty to full in about 45 minutes.',
    colors: ['#16a34a', '#14532d'],
    options: ['Storage'],
    variants: [
      { values: { Storage: '128 GB' }, price: 3600, stock: 6 },
      { values: { Storage: '256 GB' }, price: 4100, stock: 4 },
    ],
  },
  {
    name: 'OPPO Reno 11 F',
    category: 'Phones',
    description:
      'Slim Reno 11 F with portrait-centric cameras, 120 Hz AMOLED and colour-rich design. Made for selfie and lifestyle shooters.',
    colors: ['#db2777', '#9f1239'],
    variants: [{ price: 5800, stock: 4 }],
  },
  {
    name: 'vivo Y27',
    category: 'Phones',
    description:
      'vivo Y27 with a stylish textured back, 50 MP camera and 5000 mAh battery. Straightforward Android with FunTouch software.',
    colors: ['#4f46e5', '#312e81'],
    options: ['Storage'],
    variants: [
      { values: { Storage: '128 GB' }, price: 2700, stock: 8 },
      { values: { Storage: '256 GB' }, price: 3100, stock: 5 },
    ],
  },
  {
    name: 'vivo V30',
    category: 'Phones',
    description:
      'V30 with Aura Light portrait studio, curved AMOLED and ZEISS-inspired colour science. Excellent low-light selfies and video calls.',
    colors: ['#6366f1', '#3730a3'],
    options: ['Storage'],
    variants: [
      { values: { Storage: '256 GB' }, price: 7200, stock: 3 },
      { values: { Storage: '512 GB' }, price: 8200, stock: 2 },
    ],
  },
  {
    name: 'Nokia G42 5G',
    category: 'Phones',
    description:
      'Repairable Nokia G42 with 5G, clean Android and a promise of long software support. Easy to open for battery or screen swaps.',
    colors: ['#0369a1', '#0c4a6e'],
    variants: [{ price: 3200, stock: 5 }],
  },
  {
    name: 'Google Pixel 8a',
    category: 'Phones',
    description:
      'Pixel 8a with Google Tensor, best-in-class computational photography and seven years of updates. Pure Android, Magic Editor and Call Screen.',
    colors: ['#fef3c7', '#a16207'],
    options: ['Storage'],
    variants: [
      { values: { Storage: '128 GB' }, price: 9500, stock: 3 },
      { values: { Storage: '256 GB' }, price: 10800, stock: 2 },
    ],
  },
  {
    name: 'itel P55 Plus',
    category: 'Phones',
    description:
      'Budget itel with a large screen, dual SIM and expandable memory. Dependable for calls, WhatsApp and mobile money on a tight budget.',
    colors: ['#65a30d', '#3f6212'],
    variants: [{ price: 1400, stock: 15 }],
  },
  {
    name: 'Huawei nova 12 SE',
    category: 'Phones',
    description:
      'nova 12 SE with a slim design, 108 MP camera and fast charging. Comes with AppGallery; many popular apps available via sideload or Petal.',
    colors: ['#be123c', '#881337'],
    options: ['Storage'],
    variants: [
      { values: { Storage: '256 GB' }, price: 4800, stock: 4 },
      { values: { Storage: '512 GB' }, price: 5500, stock: 2 },
    ],
  },

  // ── Phone Accessories ─────────────────────────────────────────────────────
  {
    name: 'Tempered Glass Screen Protector',
    category: 'Phone Accessories',
    description:
      '9H tempered glass with oleophobic coating and an alignment frame for bubble-free fitting. Universal sizes listed – confirm your model at checkout notes.',
    colors: ['#e0f2fe', '#0284c7'],
    options: ['Fit'],
    variants: [
      { values: { Fit: 'Most 6.5–6.7" Android' }, price: 45, stock: 40 },
      { values: { Fit: 'iPhone 13 / 14 / 15' }, price: 55, stock: 30 },
      { values: { Fit: 'Samsung A-series 6.5"' }, price: 45, stock: 25 },
    ],
  },
  {
    name: 'Clear TPU Phone Case',
    category: 'Phone Accessories',
    description:
      'Flexible clear case that shows off your phone’s colour while absorbing drops. Raised edges protect the camera and screen.',
    colors: ['#f1f5f9', '#64748b'],
    options: ['Fit'],
    variants: [
      { values: { Fit: 'iPhone 13 / 14' }, price: 65, stock: 20 },
      { values: { Fit: 'iPhone 15' }, price: 70, stock: 18 },
      { values: { Fit: 'Samsung A15 / A25' }, price: 55, stock: 22 },
      { values: { Fit: 'Redmi Note 13' }, price: 55, stock: 20 },
    ],
  },
  {
    name: 'Rugged Armour Phone Case',
    category: 'Phone Accessories',
    description:
      'Dual-layer rugged case with shock-absorbing corners and a textured grip. Built for construction sites, farms and school bags.',
    colors: ['#1c1917', '#57534e'],
    options: ['Fit'],
    variants: [
      { values: { Fit: 'iPhone 14 / 15' }, price: 120, stock: 12 },
      { values: { Fit: 'Samsung S24' }, price: 130, stock: 8 },
      { values: { Fit: 'Tecno / Infinix 6.7"' }, price: 95, stock: 15 },
    ],
  },
  {
    name: 'Bluetooth Earbuds TWS',
    category: 'Phone Accessories',
    description:
      'True wireless earbuds with ENC mics for clear calls, touch controls and a charging case good for ~24 hours total. USB-C charging.',
    colors: ['#111827', '#6b7280'],
    options: ['Colour'],
    variants: [
      { values: { Colour: 'Black' }, price: 280, stock: 20 },
      { values: { Colour: 'White' }, price: 280, stock: 14 },
    ],
  },
  {
    name: 'Over-Ear Bluetooth Headset',
    category: 'Phone Accessories',
    description:
      'Comfortable over-ear headset with 30-hour battery, foldable hinges and a soft carry pouch. Great for Zoom and long listening sessions.',
    colors: ['#0f766e', '#115e59'],
    variants: [{ price: 450, compareAt: 520, stock: 10 }],
  },
  {
    name: 'Phone Tripod & Selfie Stick',
    category: 'Phone Accessories',
    description:
      'Bluetooth selfie stick that converts to a table tripod. Wireless shutter works up to 10 m – ideal for Reels, TikToks and group photos.',
    colors: ['#334155', '#0f172a'],
    variants: [{ price: 150, stock: 18 }],
  },
  {
    name: 'Magnetic Car Phone Mount',
    category: 'Phone Accessories',
    description:
      'Strong MagSafe-compatible magnetic mount for air vents. One-hand attach/detach; metal rings included for non-MagSafe phones.',
    colors: ['#27272a', '#a1a1aa'],
    variants: [{ price: 110, stock: 22 }],
  },
  {
    name: 'Laptop Sleeve 15.6"',
    category: 'Phone Accessories',
    description:
      'Padded neoprene sleeve for 15–15.6" laptops with an extra pocket for a charger and mouse. Soft interior lining prevents scratches.',
    colors: ['#1e3a8a', '#172554'],
    options: ['Colour'],
    variants: [
      { values: { Colour: 'Black' }, price: 180, stock: 15 },
      { values: { Colour: 'Grey' }, price: 180, stock: 10 },
    ],
  },
  {
    name: 'Wireless Mouse',
    category: 'Phone Accessories',
    description:
      '2.4 GHz wireless mouse with silent clicks, adjustable DPI and a USB-C rechargeable battery. Works with Windows, macOS and Chromebooks.',
    colors: ['#3f3f46', '#18181b'],
    variants: [{ price: 160, stock: 25 }],
  },
  {
    name: 'USB Flash Drive 64 GB',
    category: 'Phone Accessories',
    description:
      'Metal USB 3.0 flash drive, 64 GB. Fast file transfers for school projects, sermons and backup photos. Capless swivel design.',
    colors: ['#78716c', '#292524'],
    options: ['Capacity'],
    variants: [
      { values: { Capacity: '64 GB' }, price: 95, stock: 30 },
      { values: { Capacity: '128 GB' }, price: 150, stock: 20 },
      { values: { Capacity: '256 GB' }, price: 260, stock: 10 },
    ],
  },
];
