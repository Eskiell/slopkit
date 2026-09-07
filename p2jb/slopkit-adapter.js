/*
 * SlopKit adapter for the P2JB syscall substrate.
 * Local adaptation of the memory-facing contract in p2jb_poops.js from
 * soniciso1/P2JB@9966b9176ce2592e1ea6808c7288b7d78c6713cc.
 */
(function (global) {
    "use strict";

    const MIN_USER_ADDRESS = 0x100000000n;
    const MAX_USER_ADDRESS = 0x0000FFFFFFFFFFFFn;
    const SCRATCH_RESERVE = 0x1000n;
    const VALIDATION_SENTINEL = 0x534C4F504B495431n;

    function install(context, profile) {
        if (!context || !context.candidate || !context.rwView
            || typeof context.aim !== "function")
            throw new Error("carrier context unavailable");
        if (!profile || profile.firmware !== "12.40"
            || context.firmware !== "12.40")
            throw new Error("firmware 12.40 required");
        if (!context.scratchView || context.scratchView.length !== 0x20000)
            throw new Error("scratch 0x20000 required");

        const webkitBase = BigInt(context.webkitBase);
        const libkernelBase = BigInt(context.libkernelBase);
        const scratchAddress = BigInt(context.scratchAddress);
        if ((webkitBase & 0x3FFFn) !== 0n || (libkernelBase & 0x3FFFn) !== 0n)
            throw new Error("module base alignment failed");
        if ((scratchAddress & 0xFn) !== 0n)
            throw new Error("scratch alignment failed");

        function addressNumber(address) {
            const value = BigInt(address);
            if (value < MIN_USER_ADDRESS || value > MAX_USER_ADDRESS)
                throw new RangeError("non-canonical user address");
            return Number(value);
        }

        function aim(address) {
            context.aim(addressNumber(address));
        }

        function read8(address) {
            aim(address);
            return BigInt(context.rwView[0]);
        }

        function read16(address) {
            aim(address);
            return BigInt(context.rwView[0])
                | (BigInt(context.rwView[1]) << 8n);
        }

        function read32(address) {
            aim(address);
            let value = 0n;
            for (let i = 3; i >= 0; --i)
                value = (value << 8n) | BigInt(context.rwView[i]);
            return value;
        }

        function read64(address) {
            aim(address);
            let value = 0n;
            for (let i = 7; i >= 0; --i)
                value = (value << 8n) | BigInt(context.rwView[i]);
            return value;
        }

        function writeBytes(address, value, count) {
            aim(address);
            let remaining = BigInt.asUintN(count * 8, BigInt(value));
            for (let i = 0; i < count; ++i) {
                context.rwView[i] = Number(remaining & 0xFFn);
                remaining >>= 8n;
            }
        }

        const write8 = (address, value) => writeBytes(address, value, 1);
        const write16 = (address, value) => writeBytes(address, value, 2);
        const write32 = (address, value) => writeBytes(address, value, 4);
        const write64 = (address, value) => writeBytes(address, value, 8);

        const gadgets = {};
        for (const name of Object.keys(profile.wkGadgets))
            gadgets[name] = webkitBase + BigInt(profile.wkGadgets[name]);
        Object.freeze(gadgets);

        let scratchOffset = SCRATCH_RESERVE;
        function malloc(size) {
            const bytes = BigInt(size);
            if (bytes <= 0n)
                throw new RangeError("allocation size must be positive");
            const aligned = (bytes + 0xFn) & ~0xFn;
            const end = scratchOffset + aligned;
            if (end > BigInt(context.scratchView.length))
                throw new RangeError("scratch exhausted");
            const address = scratchAddress + scratchOffset;
            scratchOffset = end;
            return address;
        }

        function validate() {
            const original = read64(scratchAddress);
            try {
                write64(scratchAddress, VALIDATION_SENTINEL);
                if (read64(scratchAddress) !== VALIDATION_SENTINEL)
                    throw new Error("scratch write/read validation failed");
            } finally {
                write64(scratchAddress, original);
            }
            if (read64(scratchAddress) !== original)
                throw new Error("scratch restoration failed");
            return true;
        }

        const api = Object.freeze({
            firmware: context.firmware,
            read8, read16, read32, read64,
            write8, write16, write32, write64,
            malloc, validate,
            bases: Object.freeze({ webkit: webkitBase, libkernel: libkernelBase }),
            gadgets,
            profile,
            context,
        });
        global.SlopKitP2JB = api;
        return api;
    }

    global.SlopKitP2JBAdapter = Object.freeze({ install });
})(window);
