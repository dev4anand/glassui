# GlassUI

Reusable liquid-glass refraction for any HTML element. Copy `glass.css` and `glass.js` into a project.

## Basic use

Provide the image whose pixels should be refracted, include the files, then add `class="glass"` to any section, card, or div:

```html
<link rel="stylesheet" href="./glass.css">
<img data-glass-background src="./images/background.jpg" alt="" hidden>

<section class="glass card" glass-edge="35%">
  <h2>Liquid glass</h2>
  <p>Normal content goes here.</p>
</section>

<script src="./glass.js"></script>
```

Set the element's size, position, padding, and shape using your own CSS. The glass stylesheet does not force elements to be fixed overlays. The engine automatically adds its internal canvas.

You can also opt in with `data-glass` or just the `glass-edge` attribute. To target a custom class or ID without adding `glass`, configure the script selector:

```html
<script src="./glass.js" data-glass-selector=".glass, #hero-panel"></script>
```

## Tune the refraction

`glass-edge` controls how far the stretch extends inward from the edge. A larger value creates a wider stretched band. Use a decimal from `0` to `1`, or a percentage:

```html
<div class="glass" glass-edge="20%">Default-width edge band</div>
<div class="glass" glass-edge="45%">Wider liquid stretch</div>
<div class="glass" glass-edge="45%" glass-shape="circle">Circular lens</div>
```

You can use CSS variables instead:

```css
.card {
  --glass-edge: 0.35;
  --glass-refraction: 0.38;
}

.circle {
  --glass-edge: 45%;
  --glass-shape: circle;
  border-radius: 50%;
}
```

The previous `--glass-distortion-start` variable remains supported for compatibility. A lower distortion-start value means a wider edge band.

## Background and API

GlassUI refracts pixels from an image; it does not capture arbitrary HTML behind the element. The source image should align with the page backdrop. Same-origin images are easiest; remote images need CORS permission for canvas pixel access. The demo's `#wallpaper`, `img.glass-wallpaper`, and `img[src*="wallpaper"]` conventions remain supported.

The JavaScript API includes `Glass.attach()`, `Glass.detach()`, `Glass.render()`, `Glass.renderAll()`, `Glass.resize()`, `Glass.create()`, `Glass.setBackground()`, `Glass.setSelector()`, `Glass.setRefraction()`, `Glass.setEdge()`, and the compatibility method `Glass.setDistortionStart()`.
