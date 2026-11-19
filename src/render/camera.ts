export class Camera {
  x = 500;
  y = 800;
  z = 1;
  /** Tamaño de la vista en píxeles CSS. */
  vw = 1;
  vh = 1;
  mapW = 1000;
  mapH = 1600;
  maxZ = 2.6;
  /** Espacio tapado por paneles (px CSS) que se permite desplazar de más. */
  padBottom = 0;
  padRight = 0;

  get minZ(): number {
    return Math.min(this.vw / this.mapW, this.vh / this.mapH) * 0.95;
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.z + this.vw / 2, (wy - this.y) * this.z + this.vh / 2];
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.vw / 2) / this.z + this.x, (sy - this.vh / 2) / this.z + this.y];
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    this.z = Math.max(this.minZ, Math.min(this.maxZ, this.z * factor));
    // mantener el punto bajo el dedo
    this.x = wx - (sx - this.vw / 2) / this.z;
    this.y = wy - (sy - this.vh / 2) / this.z;
    this.clamp();
  }

  pan(dx: number, dy: number): void {
    this.x -= dx / this.z;
    this.y -= dy / this.z;
    this.clamp();
  }

  clamp(): void {
    this.z = Math.max(this.minZ, Math.min(this.maxZ, this.z));
    const hw = this.vw / 2 / this.z;
    const hh = this.vh / 2 / this.z;
    const m = 60;
    const pb = this.padBottom / this.z;
    const pr = this.padRight / this.z;
    if (hw * 2 >= this.mapW + m * 2 + pr) this.x = this.mapW / 2 + pr / 2;
    else this.x = Math.max(hw - m, Math.min(this.mapW - hw + m + pr, this.x));
    if (hh * 2 >= this.mapH + m * 2 + pb) this.y = this.mapH / 2 + pb / 2;
    else this.y = Math.max(hh - m, Math.min(this.mapH - hh + m + pb, this.y));
  }

  /** Zoom cómodo por defecto según la orientación. */
  defaultZoom(): number {
    const portrait = this.vh >= this.vw;
    return portrait ? this.vw / 520 : this.vh / 520;
  }
}
