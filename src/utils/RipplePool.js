import * as THREE from 'three';

export class RipplePool {
    constructor(maxSize = 10) {
        this.available = [];
        this.active = [];
        this.maxSize = maxSize;

        for (let i = 0; i < maxSize; i++) {
            this.available.push(this.createRipple());
        }
    }

    createRipple() {
        return { position: new THREE.Vector3(), time: 0, type: 0 };
    }

    acquire(position, time, type = 0) {
        const ripple = this.available.pop() || this.createRipple();
        ripple.position.copy(position);
        ripple.time = time;
        ripple.type = type;
        this.active.push(ripple);
        return ripple;
    }

    release(ripple) {
        const idx = this.active.indexOf(ripple);
        if (idx > -1) {
            this.active.splice(idx, 1);
            if (this.available.length < this.maxSize) {
                this.available.push(ripple);
            }
        }
    }

    update(currentTime, lifetime) {
        for (let i = this.active.length - 1; i >= 0; i--) {
            if (currentTime - this.active[i].time > lifetime) {
                this.release(this.active[i]);
            }
        }
    }

    clear() {
        this.available.push(...this.active);
        this.active.length = 0;
    }

    getActive() {
        return this.active;
    }

    dispose() {
        this.clear();
        this.available.length = 0;
    }
}
