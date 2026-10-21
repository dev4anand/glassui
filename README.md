# GlassUI — reusable liquid-glass effect

GlassUI provides a reusable refraction lens. Copy **`glass.css`** and **`glass.js`** into another project, then opt in the elements that should have the effect.

## 1. Add the files

Include the stylesheet and JavaScript in your page:

```html
<link rel="stylesheet" href="./glass.css">
```

## 2. Choose a background image

The refraction engine samples a supplied image. Use an image from the same origin where possible:

```html
<img data-glass-background src="./images/wallpaper.jpg" alt="" hidden>
```

The existing demo's `#wallpaper` image and `img.glass-wallpaper` convention remain supported. For a background chosen from JavaScript, call `Glass.setBackground(document.querySelector("#my-image"))`.

## 3. Add the `glass` class

The simplest option is to add `class="glass"` to any `div`, `section`, card, or other container. Keep its dimensions, position, and shape in your own CSS:

```html
<section class="glass info-card">
  <h2>Glass panel</h2>
  <p>Your content stays above the refraction canvas.</p>
</section>
```

```css
.info-card {
  width: min(90vw, 420px);
  min-height: 180px;
  border-radius: 24px;
  padding: 24px;
}
```

Then load the script, preferably near the end of the body:

```html
<script src="./glass.js"></script>
```

Ordinary `.glass` elements stay in normal document layout; the CSS does **not** force them to be fixed overlays. The demo adds `position: fixed` only to its draggable lenses.

## Target a custom class or ID instead

You can let the engine select a custom class or ID without adding `class="glass"` manually:

```html
<section id="hero-panel">...</section>
<script src="./glass.js" data-glass-selector=".glass, #hero-panel"></script>
```

Any target matched by `data-glass-selector` automatically receives the `glass` styling class. You can also use `data-glass` as an opt-in attribute with the default setup.

## Tune the effect per element

Use CSS variables on the element or its ID/class. Lower `--glass-distortion-start` to widen the area that stretches the background. The circle in the demo uses `0.58`, giving it a broader stretch band than the default `0.8`.

```css
#hero-panel {
  --glass-refraction: 0.38;          /* bend strength */
  --glass-distortion-start: 0.65;    /* lower = wider stretch band */
  border-radius: 24px;
}

/* Circular lens: make the stretch follow its circular perimeter */
#glass-circle {
  --glass-shape: circle;
  --glass-distortion-start: 0.58;
  width: 150px;
  height: 150px;
  border-radius: 50%;
}
```

- `--glass-refraction`: amount of refraction/bending.
- `--glass-distortion-start`: normalized distance from the center where stretching begins; lower values make the stretched band wider.
- `--glass-shape: circle`: use radial distortion for a circle so the stretch band follows the round edge.

The JavaScript API also retains `Glass.create()`, `Glass.attach()`, `Glass.detach()`, `Glass.render()`, `Glass.setBackground()`, `Glass.setRefraction()`, and `Glass.setDistortionStart()`.

## Important background note

GlassUI refracts the supplied source image. It does not take a screenshot of arbitrary HTML behind an element. Use the same image as the page's backdrop (or supply your intended backdrop image) for the refraction to line up visually. Remote images must permit canvas pixel access through CORS; a same-origin image is the simplest option.
