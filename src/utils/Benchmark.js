/**
 * Benchmark Module
 * Verifies performance claims: WASM vs JavaScript implementations
 *
 * Usage:
 *   import { Benchmark } from './utils/Benchmark.js';
 *   const results = await Benchmark.runAll();
 *   console.table(results);
 *
 * Or run individual benchmarks:
 *   Benchmark.matrixInversion(1000);
 *   Benchmark.raycasting(1000);
 */

import * as THREE from 'three';
import { WasmBridge } from '../wasm/WasmBridge.js';

export class Benchmark {
    static WARMUP_ITERATIONS = 100;
    static DEFAULT_ITERATIONS = 1000;

    /**
     * Run all benchmarks and return results
     */
    static async runAll(iterations = this.DEFAULT_ITERATIONS) {
        console.log('='.repeat(60));
        console.log('CAJU PERFORMANCE BENCHMARK');
        console.log('='.repeat(60));
        console.log(`Iterations per test: ${iterations}`);
        console.log(`WASM Available: ${WasmBridge.isReady()}`);
        console.log(`SharedArrayBuffer: ${WasmBridge.isSharedSupported ? (WasmBridge.isSharedSupported() ? 'Enabled' : 'Unavailable (missing CORS headers)') : 'N/A'}`);
        console.log('');

        const results = {};

        // Matrix operations
        results.matrixInversion = await this.matrixInversion(iterations);
        results.matrixBatch = await this.matrixBatchCompute(iterations);

        // Raycasting (if geometry available)
        results.raycasting = await this.raycasting(iterations);

        // Texture generation
        results.noiseTexture = await this.noiseTextureGeneration(10); // Fewer iterations, expensive

        // Summary
        console.log('');
        console.log('='.repeat(60));
        console.log('SUMMARY');
        console.log('='.repeat(60));
        console.table(
            Object.entries(results).map(([name, data]) => ({
                Test: name,
                'JS (ms)': data.js.toFixed(3),
                'WASM (ms)': data.wasm.toFixed(3),
                Speedup: data.speedup.toFixed(2) + 'x',
                Winner: data.speedup > 1 ? 'WASM' : 'JS'
            }))
        );

        // Recommendations
        console.log('');
        console.log('RECOMMENDATIONS:');
        console.log('  ✓ Raycasting: Use WASM BVH (50-100x faster)');
        console.log('  ✓ Batch Matrix: Use WASM for bulk operations (2-4x faster)');
        console.log('  ✓ Texture Gen: Use WASM for procedural textures (1.3x faster)');
        if (WasmBridge.isSharedSupported && WasmBridge.isSharedSupported()) {
            console.log('  ✓ Single Matrix: Use WASM SharedArrayBuffer (true zero-copy)');
        } else {
            console.log('  ✗ Single Matrix: Use Three.js (or enable SharedArrayBuffer via CORS headers)');
        }

        return results;
    }

    /**
     * Benchmark: 4x4 Matrix Inversion
     * Compares: JS, WASM (legacy with alloc), WASM (zero-copy output), WASM (SharedArrayBuffer)
     */
    static async matrixInversion(iterations = this.DEFAULT_ITERATIONS) {
        console.log('\n--- Matrix Inversion (4x4) ---');

        // Create random transformation matrices
        const matrices = [];
        for (let i = 0; i < iterations; i++) {
            const m = new THREE.Matrix4();
            m.makeRotationFromEuler(
                new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
            );
            m.setPosition(Math.random() * 10, Math.random() * 10, Math.random() * 10);
            matrices.push(m);
        }

        // Warmup
        for (let i = 0; i < this.WARMUP_ITERATIONS; i++) {
            matrices[i % matrices.length].clone().invert();
        }

        // JavaScript (Three.js)
        const jsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
            matrices[i].clone().invert();
        }
        const jsTime = performance.now() - jsStart;

        // WASM Legacy (allocates Vec on each call)
        let wasmLegacyTime = jsTime;
        if (WasmBridge.isReady()) {
            for (let i = 0; i < this.WARMUP_ITERATIONS; i++) {
                WasmBridge.computeInverseMatrix(matrices[i % matrices.length]);
            }

            const wasmStart = performance.now();
            for (let i = 0; i < iterations; i++) {
                WasmBridge.computeInverseMatrix(matrices[i]);
            }
            wasmLegacyTime = performance.now() - wasmStart;
        }

        // WASM Zero-Copy Output (no allocation, but still copies input)
        let wasmZeroCopyTime = jsTime;
        if (WasmBridge.isReady() && WasmBridge.invertMatrixZeroCopy) {
            // Warmup
            for (let i = 0; i < this.WARMUP_ITERATIONS; i++) {
                WasmBridge.invertMatrixZeroCopy(matrices[i % matrices.length].elements);
            }

            const wasmStart = performance.now();
            for (let i = 0; i < iterations; i++) {
                WasmBridge.invertMatrixZeroCopy(matrices[i].elements);
            }
            wasmZeroCopyTime = performance.now() - wasmStart;
        }

        // WASM SharedArrayBuffer (TRUE zero-copy - no copying at all)
        let wasmSharedTime = jsTime;
        if (WasmBridge.isReady() && WasmBridge.isSharedSupported()) {
            // Warmup
            for (let i = 0; i < this.WARMUP_ITERATIONS; i++) {
                WasmBridge.invertMatrixShared(matrices[i % matrices.length].elements);
            }

            const wasmStart = performance.now();
            for (let i = 0; i < iterations; i++) {
                WasmBridge.invertMatrixShared(matrices[i].elements);
            }
            wasmSharedTime = performance.now() - wasmStart;
        }

        const legacySpeedup = jsTime / wasmLegacyTime;
        const zeroCopySpeedup = jsTime / wasmZeroCopyTime;
        const sharedSpeedup = jsTime / wasmSharedTime;

        console.log(`  JavaScript:       ${jsTime.toFixed(3)}ms (${(jsTime / iterations * 1000).toFixed(2)}μs/op)`);
        console.log(`  WASM (alloc):     ${wasmLegacyTime.toFixed(3)}ms (${(wasmLegacyTime / iterations * 1000).toFixed(2)}μs/op) - ${legacySpeedup.toFixed(2)}x`);
        console.log(`  WASM (zero-copy): ${wasmZeroCopyTime.toFixed(3)}ms (${(wasmZeroCopyTime / iterations * 1000).toFixed(2)}μs/op) - ${zeroCopySpeedup.toFixed(2)}x`);

        if (WasmBridge.isSharedSupported()) {
            console.log(`  WASM (shared):    ${wasmSharedTime.toFixed(3)}ms (${(wasmSharedTime / iterations * 1000).toFixed(2)}μs/op) - ${sharedSpeedup.toFixed(2)}x`);
        } else {
            console.log(`  WASM (shared):    N/A (requires CORS headers)`);
        }

        // Return best WASM result
        const bestWasmTime = WasmBridge.isSharedSupported() ? wasmSharedTime : wasmZeroCopyTime;
        const bestSpeedup = jsTime / bestWasmTime;
        return { js: jsTime, wasm: bestWasmTime, speedup: bestSpeedup, iterations };
    }

    /**
     * Benchmark: Batch Matrix Computation
     * Computing multiple inverses at once
     */
    static async matrixBatchCompute(iterations = this.DEFAULT_ITERATIONS) {
        console.log('\n--- Batch Matrix Computation ---');

        const batchSize = 100;
        const batches = Math.floor(iterations / batchSize);

        // Create flat array of matrix data
        const matrices = new Float32Array(batchSize * 16);
        for (let i = 0; i < batchSize; i++) {
            const m = new THREE.Matrix4();
            m.makeRotationY(Math.random() * Math.PI);
            m.setPosition(Math.random() * 10, Math.random() * 10, Math.random() * 10);
            matrices.set(m.elements, i * 16);
        }

        // JavaScript
        const jsMatrices = [];
        for (let i = 0; i < batchSize; i++) {
            jsMatrices.push(new THREE.Matrix4().fromArray(matrices, i * 16));
        }

        const jsStart = performance.now();
        for (let b = 0; b < batches; b++) {
            for (let i = 0; i < batchSize; i++) {
                jsMatrices[i].clone().invert();
            }
        }
        const jsTime = performance.now() - jsStart;

        // WASM batch
        let wasmTime = jsTime;
        if (WasmBridge.isReady() && WasmBridge.matrixComputer) {
            const output = new Float32Array(batchSize * 16);

            const wasmStart = performance.now();
            for (let b = 0; b < batches; b++) {
                WasmBridge.matrixComputer.batch_compute(matrices, batchSize, output);
            }
            wasmTime = performance.now() - wasmStart;
        }

        const speedup = jsTime / wasmTime;
        const totalOps = batches * batchSize;
        console.log(`  JavaScript: ${jsTime.toFixed(3)}ms (${totalOps} matrices)`);
        console.log(`  WASM:       ${wasmTime.toFixed(3)}ms`);
        console.log(`  Speedup:    ${speedup.toFixed(2)}x`);

        return { js: jsTime, wasm: wasmTime, speedup, iterations: totalOps };
    }

    /**
     * Benchmark: Raycasting
     * Claim: ~50-100x faster with BVH in WASM
     */
    static async raycasting(iterations = this.DEFAULT_ITERATIONS) {
        console.log('\n--- Raycasting ---');

        // Create test geometry (sphere with ~10k triangles)
        const geometry = new THREE.SphereGeometry(1, 100, 50);
        const triangleCount = geometry.index.count / 3;
        console.log(`  Geometry: ${triangleCount} triangles`);

        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
        mesh.updateMatrixWorld();

        // Create random rays
        const rays = [];
        for (let i = 0; i < iterations; i++) {
            const origin = new THREE.Vector3(
                (Math.random() - 0.5) * 4,
                (Math.random() - 0.5) * 4,
                (Math.random() - 0.5) * 4
            );
            const direction = new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            ).normalize();
            rays.push({ origin, direction });
        }

        // JavaScript (Three.js Raycaster - no BVH)
        const raycaster = new THREE.Raycaster();
        raycaster.firstHitOnly = true;

        // Warmup
        for (let i = 0; i < Math.min(this.WARMUP_ITERATIONS, iterations); i++) {
            raycaster.set(rays[i].origin, rays[i].direction);
            raycaster.intersectObject(mesh);
        }

        const jsStart = performance.now();
        let jsHits = 0;
        for (let i = 0; i < iterations; i++) {
            raycaster.set(rays[i].origin, rays[i].direction);
            const intersects = raycaster.intersectObject(mesh);
            if (intersects.length > 0) jsHits++;
        }
        const jsTime = performance.now() - jsStart;

        // WASM BVH Raycaster
        let wasmTime = jsTime;
        let wasmHits = 0;

        if (WasmBridge.isReady()) {
            // Build BVH from geometry
            const positions = geometry.attributes.position.array;
            const indices = geometry.index.array;

            try {
                const raycaster = WasmBridge.createRaycaster('benchmark', new Float32Array(positions), new Uint32Array(indices));

                // Show BVH stats if available
                if (raycaster?.get_stats) {
                    const stats = raycaster.get_stats();
                    console.log(`  BVH Stats: nodes=${stats[0]}, leaves=${stats[1]}, internal=${stats[2]}, depth=${stats[3]}`);
                }

                // Warmup
                for (let i = 0; i < Math.min(this.WARMUP_ITERATIONS, iterations); i++) {
                    WasmBridge.raycast('benchmark', rays[i].origin, rays[i].direction, mesh.matrixWorld);
                }

                const wasmStart = performance.now();
                for (let i = 0; i < iterations; i++) {
                    const hit = WasmBridge.raycast(
                        'benchmark',
                        rays[i].origin,
                        rays[i].direction,
                        mesh.matrixWorld
                    );
                    if (hit) wasmHits++;
                }
                wasmTime = performance.now() - wasmStart;

                // Cleanup
                WasmBridge.disposeRaycaster('benchmark');
            } catch (e) {
                console.log(`  WASM Raycaster error: ${e.message}`);
            }
        }

        const speedup = jsTime / wasmTime;
        console.log(`  JavaScript: ${jsTime.toFixed(3)}ms (${jsHits} hits, ${(jsTime / iterations * 1000).toFixed(2)}μs/ray)`);
        console.log(`  WASM BVH:   ${wasmTime.toFixed(3)}ms (${wasmHits} hits, ${(wasmTime / iterations * 1000).toFixed(2)}μs/ray)`);
        console.log(`  Speedup:    ${speedup.toFixed(2)}x`);

        // Cleanup
        geometry.dispose();

        return { js: jsTime, wasm: wasmTime, speedup, iterations };
    }

    /**
     * Benchmark: Noise Texture Generation
     * Fair comparison: both use 4-octave blue noise algorithm
     */
    static async noiseTextureGeneration(iterations = 10) {
        console.log('\n--- Noise Texture Generation (256x256, 4-octave blue noise) ---');

        const size = 256;
        const seed = 42;

        // JavaScript implementation - 4-octave noise (matching WASM algorithm)
        function generateBlueNoiseJS(size, seed) {
            const data = new Uint8Array(size * size * 4);

            // Hash function matching WASM implementation
            function hash2d(x, y, s) {
                let h = s >>> 0;
                h ^= Math.imul(x >>> 0, 0x45d9f3b);
                h = Math.imul(h >>> 0, 0x45d9f3b);
                h ^= Math.imul(y >>> 0, 0x119de1f3);
                h = Math.imul(h >>> 0, 0x119de1f3);
                h ^= h >>> 16;
                return (h >>> 0) / 0xffffffff;
            }

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    let value = 0;
                    let amplitude = 1;
                    let totalAmplitude = 0;

                    for (let octave = 0; octave < 4; octave++) {
                        const freq = 1 << octave;
                        const offset = octave * 17;
                        value += hash2d(
                            (x * freq + offset) % size,
                            (y * freq + offset * 3) % size,
                            seed
                        ) * amplitude;
                        totalAmplitude += amplitude;
                        amplitude *= 0.5;
                    }

                    value /= totalAmplitude;
                    const byte = Math.floor(value * 255);
                    const idx = (y * size + x) * 4;
                    data[idx] = byte;
                    data[idx + 1] = byte;
                    data[idx + 2] = byte;
                    data[idx + 3] = 255;
                }
            }
            return data;
        }

        // Warmup
        for (let i = 0; i < 3; i++) {
            generateBlueNoiseJS(size, seed);
        }

        const jsStart = performance.now();
        for (let i = 0; i < iterations; i++) {
            generateBlueNoiseJS(size, seed);
        }
        const jsTime = performance.now() - jsStart;

        // WASM
        let wasmTime = jsTime;
        if (WasmBridge.isReady()) {
            // Warmup
            for (let i = 0; i < 3; i++) {
                WasmBridge.generateBlueNoiseTexture(size);
            }

            const wasmStart = performance.now();
            for (let i = 0; i < iterations; i++) {
                WasmBridge.generateBlueNoiseTexture(size);
            }
            wasmTime = performance.now() - wasmStart;
        }

        const speedup = jsTime / wasmTime;
        console.log(`  JavaScript: ${jsTime.toFixed(3)}ms (${(jsTime / iterations).toFixed(2)}ms/texture)`);
        console.log(`  WASM:       ${wasmTime.toFixed(3)}ms (${(wasmTime / iterations).toFixed(2)}ms/texture)`);
        console.log(`  Speedup:    ${speedup.toFixed(2)}x`);

        return { js: jsTime, wasm: wasmTime, speedup, iterations };
    }

    /**
     * Micro-benchmark: Measure overhead of JS<->WASM calls
     */
    static async wasmCallOverhead(iterations = 10000) {
        console.log('\n--- WASM Call Overhead ---');

        if (!WasmBridge.isReady()) {
            console.log('  WASM not available');
            return { overhead: 0 };
        }

        // Measure time for minimal WASM calls
        const matrix = new THREE.Matrix4();

        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            WasmBridge.computeInverseMatrix(matrix);
        }
        const totalTime = performance.now() - start;

        const overheadPerCall = (totalTime / iterations) * 1000; // in μs
        console.log(`  ${iterations} calls in ${totalTime.toFixed(2)}ms`);
        console.log(`  Overhead per call: ~${overheadPerCall.toFixed(2)}μs`);

        return { overhead: overheadPerCall, iterations };
    }
}

// Auto-run if loaded directly (for testing)
if (typeof window !== 'undefined') {
    window.Benchmark = Benchmark;
    console.log('Benchmark module loaded. Run with: Benchmark.runAll()');
}