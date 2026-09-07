"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadBrowserScript(relativePath, additions = {}) {
    const window = { ...additions };
    const context = vm.createContext({ window, globalThis: window, ...additions });
    const filename = path.join(__dirname, "..", "..", relativePath);
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
    return window;
}

module.exports = { loadBrowserScript };
