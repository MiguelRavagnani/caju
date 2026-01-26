/**
 * Shader Injection Utilities
 * Helper functions for modifying Three.js shader source code
 */

/**
 * Insert code after a search string in shader source
 * @param {string} shaderSource - The shader source code
 * @param {string} searchString - The string to search for
 * @param {string} injection - The code to inject after the search string
 * @returns {string} Modified shader source
 */
export function findAndInsertAfter(shaderSource, searchString, injection) {
    const index = shaderSource.indexOf(searchString);
    if (index === -1) {
        return shaderSource;
    }

    const insertIndex = index + searchString.length;
    return (
        shaderSource.slice(0, insertIndex) +
        '\n' +
        injection +
        '\n' +
        shaderSource.slice(insertIndex)
    );
}

/**
 * Insert code before a search string in shader source
 * @param {string} shaderSource - The shader source code
 * @param {string} searchString - The string to search for
 * @param {string} injection - The code to inject before the search string
 * @returns {string} Modified shader source
 */
export function findAndInsertBefore(shaderSource, searchString, injection) {
    const index = shaderSource.indexOf(searchString);
    if (index === -1) {
        return shaderSource;
    }

    return shaderSource.slice(0, index) + '\n' + injection + '\n' + shaderSource.slice(index);
}

/**
 * Add varying declarations to the top of a shader
 * @param {string} shaderSource - The shader source code
 * @param {string[]} varyingsList - List of varying declarations (e.g., ['varying vec3 vWorldNormal;'])
 * @returns {string} Modified shader source
 */
export function addVaryings(shaderSource, varyingsList) {
    if (!varyingsList || varyingsList.length === 0) {
        return shaderSource;
    }

    const varyingsBlock = varyingsList.join('\n') + '\n';

    // Insert varyings after the first line (usually the version or precision statement)
    const lines = shaderSource.split('\n');
    lines.splice(1, 0, varyingsBlock);

    return lines.join('\n');
}

/**
 * Add uniform declarations to the top of a shader
 * @param {string} shaderSource - The shader source code
 * @param {string[]} uniformsList - List of uniform declarations (e.g., ['uniform float uTime;'])
 * @returns {string} Modified shader source
 */
export function addUniforms(shaderSource, uniformsList) {
    if (!uniformsList || uniformsList.length === 0) {
        return shaderSource;
    }

    const uniformsBlock = uniformsList.join('\n') + '\n';

    // Insert uniforms at the beginning
    const lines = shaderSource.split('\n');
    lines.splice(1, 0, uniformsBlock);

    return lines.join('\n');
}
