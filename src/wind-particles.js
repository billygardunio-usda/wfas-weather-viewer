import { toLonLat } from 'ol/proj.js';
import { sampleGrid } from './nomads-grid.js';

export function particleDelta(u, v, latitude, scale = 0.32) {
  const latitudeScale = Math.max(0.35, Math.cos(latitude * Math.PI / 180));
  return [u * scale / latitudeScale, -v * scale];
}

export class WindParticles {
  constructor(map, container, count = 900) {
    this.map = map;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'wind-particle-canvas';
    const mapNote = container.querySelector('.map-note');
    if (mapNote) mapNote.before(this.canvas);
    else container.append(this.canvas);
    this.context = this.canvas.getContext('2d');
    this.count = count;
    this.particles = [];
    this.grid = null;
    this.visible = false;
    this.frame = null;
    this.resize = () => this.reset();
    map.on('moveend', this.resize);
    window.addEventListener('resize', this.resize);
  }

  setGrid(grid) {
    this.grid = grid;
    this.visible = Boolean(grid);
    this.canvas.hidden = !this.visible;
    this.reset();
    if (this.visible && !this.frame) this.frame = requestAnimationFrame(() => this.draw());
  }

  resetParticle(particle = {}) {
    particle.x = Math.random() * (this.width || 1);
    particle.y = Math.random() * (this.height || 1);
    particle.age = Math.floor(Math.random() * 90);
    return particle;
  }

  reset() {
    const size = this.map.getSize();
    if (!size) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    [this.width, this.height] = size;
    this.canvas.width = Math.round(size[0] * ratio);
    this.canvas.height = Math.round(size[1] * ratio);
    this.canvas.style.width = `${size[0]}px`;
    this.canvas.style.height = `${size[1]}px`;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.particles = Array.from({ length: this.count }, () => this.resetParticle());
  }

  draw() {
    this.frame = null;
    if (!this.visible || !this.grid) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = this.canvas.width / ratio, height = this.canvas.height / ratio;
    this.context.globalCompositeOperation = 'destination-in';
    this.context.fillStyle = 'rgba(0,0,0,0.92)';
    this.context.fillRect(0, 0, width, height);
    this.context.globalCompositeOperation = 'source-over';
    this.context.strokeStyle = 'rgba(255,255,255,0.72)';
    this.context.lineWidth = 0.8;
    this.context.beginPath();
    for (const particle of this.particles) {
      if (particle.age++ > 90 || particle.x < 0 || particle.y < 0 || particle.x > width || particle.y > height) this.resetParticle(particle);
      const coordinate = this.map.getCoordinateFromPixel([particle.x, particle.y]);
      const [longitude, latitude] = toLonLat(coordinate);
      const u = sampleGrid(this.grid, longitude, latitude, 'u'), v = sampleGrid(this.grid, longitude, latitude, 'v');
      if (u == null || v == null) {
        this.resetParticle(particle);
        continue;
      }
      const startX = particle.x, startY = particle.y;
      const [deltaX, deltaY] = particleDelta(u, v, latitude);
      particle.x += deltaX;
      particle.y += deltaY;
      this.context.moveTo(startX, startY);
      this.context.lineTo(particle.x, particle.y);
    }
    this.context.stroke();
    this.frame = requestAnimationFrame(() => this.draw());
  }
}
