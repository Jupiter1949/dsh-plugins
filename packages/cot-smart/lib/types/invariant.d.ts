// Package-owned invariant companion for `dsh-cot-smart`.
// @module dsh-cot-smart/invariant

import type { Context } from "@deepseek-ai/cordis";
import type { InvariantInstaller } from "@deepseek-ai/dsh-invariants";

export declare const name: "dsh-cot-smart-invariant";
export declare const inject: string[];

export declare const apply: (ctx: Context) => Promise<() => void>;
