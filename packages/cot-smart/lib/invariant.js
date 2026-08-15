// Package-owned invariant companion for `dsh-cot-smart`.
// @module dsh-cot-smart/invariant
//
// No runtime invariant: this plugin is a pure `agent/request` route decorator.
// Its observable behavior (the reasoningEffort it proposes) is already proven
// by the routing decision tests in tools/ and by the request-header it returns;
// it owns no mutable state or cross-plugin event relationship that a runtime
// invariant could check.

const PACKAGE_NAME = "dsh-cot-smart";

/** Cordis companion plugin name. */
export const name = "dsh-cot-smart-invariant";
/** Service required before the companion can reserve package ownership. */
export const inject = ["invariants"];

/** No runtime invariant to install (see module header). */
const install = () => {};

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the registration's disposer after setup resolves.
 */
export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
