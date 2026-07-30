import { BadRequestException } from "@nestjs/common";

export function parseCredits(value: string, options: { signed?: boolean; minimumMilli?: bigint; maximumMilli?: bigint; decimalPlaces?: 2 | 3 } = {}) {
    const normalized = String(value || "").trim();
    const decimalPlaces = options.decimalPlaces ?? 2;
    const pattern = new RegExp(`^${options.signed ? "-?" : ""}(0|[1-9]\\d{0,5})(?:\\.(\\d{1,${decimalPlaces}}))?$`);
    const match = normalized.match(pattern);
    if (!match) throw new BadRequestException(`积分金额格式无效，最多保留${decimalPlaces === 3 ? "三" : "两"}位小数`);
    const negative = normalized.startsWith("-");
    const unsigned = negative ? normalized.slice(1) : normalized;
    const [whole = "0", fraction = ""] = unsigned.split(".");
    const milli = (BigInt(whole) * 1_000n + BigInt(fraction.padEnd(3, "0") || "0")) * (negative ? -1n : 1n);
    const absolute = milli < 0n ? -milli : milli;
    const minimum = options.minimumMilli ?? 10n;
    const maximum = options.maximumMilli ?? 100_000_000n;
    if (absolute < minimum || absolute > maximum) throw new BadRequestException(`积分金额需要在 ${formatMilliCredits(minimum)}-${formatMilliCredits(maximum)} 之间`);
    return milli;
}

export function formatMilliCredits(value: bigint | string | number) {
    const milli = BigInt(value);
    const negative = milli < 0n;
    const absolute = negative ? -milli : milli;
    const whole = absolute / 1_000n;
    const fraction = (absolute % 1_000n).toString().padStart(3, "0").replace(/0+$/, "");
    return `${negative ? "-" : ""}${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

export function milliCreditsToFen(value: bigint) {
    if (value % 10n !== 0n) throw new BadRequestException("充值金额最多保留两位小数");
    const fen = value / 10n;
    if (fen > 2_147_483_647n) throw new BadRequestException("充值金额过大");
    return Number(fen);
}

export function serializeMilli(value: bigint) {
    return { milliCredits: value.toString(), credits: formatMilliCredits(value) };
}
