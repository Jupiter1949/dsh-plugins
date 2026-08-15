import z from "@deepseek-ai/schemastery";
import type { Context } from "@deepseek-ai/cordis";

export declare const name: "dsh-cot-smart";
export declare const inject: string[];

export declare const Config: z.ZodType<{
	mode: "conservative" | "balanced" | "aggressive";
}>;

export declare function apply(ctx: Context, config: {
	mode: "conservative" | "balanced" | "aggressive";
}): void;
