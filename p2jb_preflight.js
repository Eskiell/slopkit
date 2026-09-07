"use strict";

globalThis.p2jbPreflightPromise = (async function () {
    const SYS_KQUEUEEX = 0x8Dn;
    const BAD_NAME_PTR = 0x800000000000n;

    try {
        if (typeof log === "function")
            await log("[kqueueex-poc] iniciando chamada unica");

        if (typeof syscall !== "function")
            throw new Error("syscall() nao disponivel");

        const ret = await Promise.resolve(
            syscall(
                SYS_KQUEUEEX,
                BAD_NAME_PTR,
                0n
            )
        );

        const r = BigInt(ret);

        if (typeof log === "function") {
            await log(
                "[kqueueex-poc] ret="
                + r.toString()
                + " / 0x"
                + r.toString(16)
            );
        }

        if (r === 14n) {
            await log("[kqueueex-poc] EFAULT -> leak path atingido");
        } else if (r === 12n) {
            await log("[kqueueex-poc] ENOMEM -> chgkqcnt bloqueou antes do leak");
        } else if (r === 0n) {
            await log("[kqueueex-poc] SUCCESS -> NAO estamos no leak path");
        } else {
            await log("[kqueueex-poc] retorno inesperado");
        }
    } catch (e) {
        if (typeof log === "function")
            await log("[kqueueex-poc] exception: " + String(e));
    } finally {
        if (typeof log === "function")
            await log("[kqueueex-poc] finalizado");
    }
})();
