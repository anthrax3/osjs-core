/*
 * OS.js - JavaScript Cloud/Web Desktop Platform
 *
 * Copyright (c) 2011-2018, Anders Evenrud <andersevenrud@gmail.com>
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @author  Anders Evenrud <andersevenrud@gmail.com>
 * @licence Simplified BSD License
 */

import {style, script} from './utils';

/*
 * Fetch package manifest
 */
const fetchManifest = async () => {
  const response = await fetch('metadata.json');
  const metadata = await response.json();

  return metadata;
};

/*
 * OS.js Package Manager
 */
export default class PackageManager {

  /**
   * Create package manage
   *
   * @param {Core} core Core reference
   */
  constructor(core) {
    this.core = core;
    this.packages = [];
    this.metadata = [];
    this.loaded = [];
  }

  /**
   * Destroy package manager
   */
  destroy() {
    this.packages = [];
    this.metadata = [];
  }

  /**
   * Initializes package manager
   */
  async init() {
    console.debug('PackageManager::init()');

    this.metadata = await fetchManifest();
  }

  /**
   * Loads all resources required for a package
   * @param {Array} list A list of resources
   * @param {Boolean} [force=false] Force loading even though previously cached
   * @return {String[]} A list of failed resources
   */
  async preload(list, force = false) {
    const root = this.core.$root;

    console.group('PackageManager::preload()');

    let failed = [];
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      const cached = this.loaded.find(src => src === entry);

      if (!force && cached) {
        continue;
      }

      console.debug('PackageManager::preload()', entry);

      try {
        const el = entry.match(/\.js$/)
          ? await script(root, entry)
          : await style(root, entry);

        if (!cached) {
          this.loaded.push(entry);
        }

        console.debug('=>', el);
      } catch (e) {
        failed.push(entry);
        console.warn(e);
      }
    }

    console.groupEnd();

    return failed;
  }

  /**
   * Launches a package
   *
   * @param {String} name Package name
   * @param {Object} [args] Launch arguments
   * @param {Object} [options] Launch options
   * @see PackageServiceProvider
   * @throws {Error}
   * @return {Application}
   */
  async launch(name, args = {}, options = {}) {
    const fail = err => {
      this.core.emit('osjs/application:created', name, false);
      throw new Error(err);
    };

    const metadata = this.metadata.find(pkg => pkg.name === name);
    if (!metadata) {
      throw new Error(`Package Metadata ${name} not found`);
    }

    this.core.emit('osjs/application:create', name, args, options);

    const errors = await this.preload(metadata.files.map(f => `packages/${metadata._path}/${f}`));
    if (errors.length) {
      fail(`Package Loading ${name} failed: ${errors.join(', ')}`);
    }

    const found = this.packages.find(pkg => pkg.metadata.name === name);
    if (!found) {
      fail(`Package Runtime ${name} not found`);
    }

    let app;
    console.group('PackageManager::launch()');

    try {
      app = found.callback(this.core, args, options, found.metadata);
    } catch (e) {
      console.warn(e);
    } finally {
      this.core.emit('osjs/application:created', name, app);
      console.groupEnd();
    }

    return app;
  }

  /**
   * Registers a package
   *
   * @param {String} name Package name
   * @param {Function} callback Callback function to construct application instance
   * @throws {Error}
   */
  register(name, callback) {
    console.log('PackageManager::register()', name);

    const metadata = this.metadata.find(pkg => pkg.name === name);
    if (!metadata) {
      throw new Error(`Metadata not found for ${name}. Is it in the manifest ?`);
    }

    this.packages.push({
      metadata,
      callback
    });
  }
}
