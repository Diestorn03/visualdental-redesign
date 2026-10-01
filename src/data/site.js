// Single source of truth for everything the site says about Visual Dental Arts (docs/CONTENT.md, "Datos de contacto").
// Items marked `confirm with client` are not verified on the client's channels. Read-only for section agents.
import { url } from '../lib/url.js';

// Proposal build: noindex + "Proposal" ribbon + palette switch + demo notes. PUBLIC_DEMO=1 turns it on; "", 0, off or false turn it off.
const flag = import.meta.env.PUBLIC_DEMO;
export const demo = !!flag && !/^(0|off|false)$/i.test(String(flag));

export const brand = {
  name: 'Visual Dental Arts',
  tagline: 'Boutique Dental Laboratory',
  // verbatim hero sub-line
  description: 'Every case is hand-crafted with precision, shaped by years of artisan technique, and elevated through modern digital technologies.',
};

export const contact = {
  phoneDisplay: '(219) 278-0110',
  phoneE164: '+12192780110',
  phoneHref: 'tel:+12192780110',
  email: 'visualdentalarts@yahoo.com',
  emailHref: 'mailto:visualdentalarts@yahoo.com',
  street: '1 W Dunes Hwy',
  city: 'Beverly Shores',
  region: 'IN',
  postalCode: '46304',
  country: 'US',
  address: '1 W Dunes Hwy, Beverly Shores, IN 46304, United States',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=1+W+Dunes+Hwy+Beverly+Shores+IN+46304',
};

export const social = {
  instagram: 'https://www.instagram.com/aleksandra_polczynski/',
  instagramHandle: '@aleksandra_polczynski',
  // YouTube: no channel confirmed, videos are linked by id in the Stories data. // confirm with client
};

export const legal = {
  privacy: 'https://www.visualdentalarts.com/privacy-policy',
  terms: 'https://www.visualdentalarts.com/terms-and-conditions',
};

// One page: every link is a hash on the home page (works from 404 too).
export const nav = [
  { href: url('#about'), id: 'about', label: 'About' },
  { href: url('#services'), id: 'services', label: 'Services' },
  { href: url('#process'), id: 'process', label: 'Process' },
  { href: url('#education'), id: 'education', label: 'Education' },
  { href: url('#stories'), id: 'stories', label: 'Stories' },
  { href: url('#faq'), id: 'faq', label: 'FAQ' },
];
export const cta = { href: url('#contact'), label: 'Send a case' };
