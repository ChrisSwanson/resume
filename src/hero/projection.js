// World metres -> image pixels for one rendered frame (render/README.md, "World-to-screen
// projection"). The camera is orthographic, so this is affine: one 2x3 matrix per frame.
const RAD = Math.PI / 180;

/** @returns {{ at: (x, y, z?) => [px, py], ground: (px, py, z?) => [x, y], plane: number[], k: number, width: number, height: number }} */
export function projection(scene, frameName) {
  const f = scene.frames[frameName];
  const a = scene.camera.azimuth * RAD, e = scene.camera.elevation * RAD;
  const [W, H] = f.res;
  const k = W / f.widthM;                       // pixels per metre
  const [tx, ty, tz] = f.target;
  const ca = Math.cos(a), sa = Math.sin(a), se = Math.sin(e), ce = Math.cos(e);
  const at = (x, y, z = 0) => {
    const dx = x - tx, dy = y - ty, dz = z - tz;
    const sx = dx * ca + dy * sa;
    const sy = -dx * sa * se + dy * ca * se + dz * ce;
    return [W / 2 + sx * k, H / 2 - sy * k];
  };
  // the inverse at a known height: image pixel -> world (x, y)
  const ground = (px, py, z = 0) => {
    const sx = (px - W / 2) / k, sy = (H / 2 - py) / k - (z - tz) * ce;
    return [tx + (sx * ca * se - sa * sy) / se, ty + (ca * sy + sx * sa * se) / se];
  };
  // linear part for vectors lying in the ground plane: pixel = plane · [dx, dy]
  const plane = [ca * k, sa * se * k, sa * k, -ca * se * k];   // SVG matrix(a, b, c, d) order
  return { at, ground, plane, k, width: W, height: H };
}
