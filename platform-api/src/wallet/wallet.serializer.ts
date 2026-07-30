import { formatMilliCredits } from "../common/money";

export function serializeWallet(wallet: { availableMilliCredits: bigint; frozenMilliCredits: bigint; updatedAt: Date }) {
    return {
        availableMilliCredits: wallet.availableMilliCredits.toString(),
        availableCredits: formatMilliCredits(wallet.availableMilliCredits),
        frozenMilliCredits: wallet.frozenMilliCredits.toString(),
        frozenCredits: formatMilliCredits(wallet.frozenMilliCredits),
        updatedAt: wallet.updatedAt,
    };
}
