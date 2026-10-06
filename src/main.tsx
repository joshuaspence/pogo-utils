/**
 * The entry point, and the only module the markup names.
 *
 * Every stylesheet is imported here rather than each page importing its own, which is the one thing about this that is
 * esbuild's decision rather than a preference. A page is reached through `import()`, so a stylesheet imported from one
 * lands in that chunk's own CSS file — and esbuild ships no runtime to fetch it, so the five page sheets were emitted
 * into `dist/src/` and nothing ever loaded them. Every page rendered unstyled.
 *
 * Importing them from the entry puts the lot in the one `main.css` that `index.html` links. What makes that safe is the
 * scoping: each page sheet is wrapped in `body[data-page='…']`, because between them they give nineteen class names a
 * different meaning per page. Loading all five at once was impossible before that and is the plain reading now.
 */

import { render } from 'preact';

// The shell's own, which outlive any page: the design tokens, the tab bar, and the shared heading and footer.
import './theme.css';
import './nav.css';
import './chrome.css';

/*
 * Leaflet's, ahead of the page sheets because `styles.css` overrides its popup rules — the order `map.html` linked the
 * two in. The scoping makes those overrides win on specificity alone now, so this is belt and braces rather than the
 * thing holding them up.
 */
import 'leaflet/dist/leaflet.css';

// The pages', in the tab bar's order. Each is scoped to its own page and inert on the other four.
import './events.css';
import './styles.css';
import './search.css';
import './pokedex.css';
import './pgsharp.css';

import { byId } from './dom.js';
import { Shell } from './shell.js';

render(<Shell />, byId('root'));
