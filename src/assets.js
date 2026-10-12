// Loads every image the film uses. Product imagery comes from the official
// CoolFly website (see assets/README.md); swap a file here to update a shot.

const IMAGES = {
  urbanStudio: 'assets/urban_studio.jpg',
  urbanGoldenGate: 'assets/urban_goldengate.jpg',
  urbanCutout: 'assets/urban_cutout.webp',
  urbanPilot: 'assets/urban_pilot_cutout.webp',
  dreamStudio: 'assets/dreampro_studio.jpg',
  dreamCutout: 'assets/dreampro_cutout.webp',
};

export async function loadAssets(THREE, renderer) {
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const entries = await Promise.all(
    Object.entries(IMAGES).map(async ([key, url]) => {
      const tex = await loader.loadAsync('/' + url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      return [key, tex];
    }),
  );
  const textures = Object.fromEntries(entries);
  const logo = await loadLogo('/assets/logo.svg');
  return { textures, logo };
}

// Parses the traced logo into Path2D pieces so captions can animate it
// shape by shape on the 2D overlay.
async function loadLogo(url) {
  const svgText = await (await fetch(url)).text();
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;
  const [x, y, w, h] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const pieces = [...svg.querySelectorAll('path')].map((p) => {
    const path = new Path2D(p.getAttribute('d'));
    const nums = p.getAttribute('d').match(/-?\d+(\.\d+)?/g).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    return {
      path,
      accent: p.getAttribute('data-role') === 'accent',
      cx: (Math.min(...xs) + Math.max(...xs)) / 2,
      cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  });
  return { x, y, w, h, pieces };
}
