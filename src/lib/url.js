// The only place that reads BASE_URL (components must never use it directly).
// '' on a root deploy, '/<repo>' on GitHub Pages project sites.
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const join = (p) => `${base}/${p.replace(/^\//, '')}`;

/** Page link: url() → '/<base>/', url('#contact') → '/<base>/#contact', url('/404/') → '/<base>/404/'. */
export const url = (path = '') => join(path);
/** File from public/: asset('brand/og.jpg') or asset('/brand/og.jpg') → '/<base>/brand/og.jpg'. */
export const asset = (path) => join(path);
