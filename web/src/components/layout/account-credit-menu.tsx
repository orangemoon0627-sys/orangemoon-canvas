import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CircleDollarSign, Coins, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Dropdown } from "antd";
import { useNavigate } from "react-router-dom";

import { RechargeModal } from "@/components/account/recharge-modal";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/use-auth-store";

export function AccountCreditMenu({ className, style, compact = false }: { className?: string; style?: CSSProperties; compact?: boolean }) {
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);
    const [rechargeOpen, setRechargeOpen] = useState(false);
    const [walletPulse, setWalletPulse] = useState(false);
    const walletUpdatedAtRef = useRef(user?.wallet?.updatedAt);

    useEffect(() => {
        const updatedAt = user?.wallet?.updatedAt;
        if (!updatedAt || updatedAt === walletUpdatedAtRef.current) return;
        walletUpdatedAtRef.current = updatedAt;
        setWalletPulse(true);
        const timer = window.setTimeout(() => setWalletPulse(false), 900);
        return () => window.clearTimeout(timer);
    }, [user?.wallet?.updatedAt]);

    if (!user) return null;
    const availableCredits = user.wallet?.availableCredits || "0";
    const frozenCredits = user.wallet?.frozenCredits || "0";
    const hasFrozenCredits = Number(frozenCredits) > 0;
    const initial = Array.from(user.displayName.trim() || user.email)[0]?.toUpperCase() || "橙";
    const roleLabel = user.role === "ADMIN" ? "管理员" : "创作者";

    return (
        <>
            <Dropdown
                trigger={["click"]}
                menu={{
                    items: [
                        { key: "identity", disabled: true, label: <div className="w-56 py-1"><div className="flex items-center gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#e9583e] text-sm font-semibold text-white">{initial}</span><div className="min-w-0"><div className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">{user.displayName}</div><div className="truncate text-xs text-stone-500">{user.email}</div></div></div><div className="mt-3 space-y-1 border-t border-stone-200 pt-2.5 text-xs dark:border-stone-700"><div className="flex items-center justify-between"><span className="text-stone-500">{roleLabel}</span><span className="font-medium tabular-nums text-stone-800 dark:text-stone-100">可用 {availableCredits} 积分</span></div>{hasFrozenCredits ? <div className="flex items-center justify-between text-amber-600 dark:text-amber-400"><span>生成中冻结</span><span className="font-medium tabular-nums">{frozenCredits} 积分</span></div> : null}</div></div> },
                        { type: "divider" },
                        { key: "recharge", icon: <CircleDollarSign className="size-4" />, label: "积分充值" },
                        { key: "account", icon: <UserRound className="size-4" />, label: "账户中心" },
                        ...(user.role === "ADMIN" ? [{ key: "admin", icon: <ShieldCheck className="size-4" />, label: "管理后台" }] : []),
                        { type: "divider" },
                        { key: "logout", icon: <LogOut className="size-4" />, label: "退出登录", danger: true },
                    ],
                    onClick: ({ key }) => {
                        if (key === "recharge") setRechargeOpen(true);
                        if (key === "account") navigate("/account");
                        if (key === "admin") navigate("/admin");
                        if (key === "logout") void logout();
                    },
                }}
            >
                <button
                    type="button"
                    className={cn(
                        "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md border border-black/10 bg-black/[0.025] px-1.5 text-xs font-medium text-stone-700 transition hover:bg-black/[0.06] hover:text-stone-950 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-200 dark:hover:bg-white/10 dark:hover:text-white",
                        compact ? "max-w-36" : "max-w-56",
                        walletPulse && "border-amber-400/70 bg-amber-50 text-amber-800 dark:border-amber-400/50 dark:bg-amber-400/10 dark:text-amber-200",
                        className,
                    )}
                    style={style}
                    title={`${user.displayName} · 可用 ${availableCredits} 积分`}
                    aria-label={`${user.displayName}，可用 ${availableCredits} 积分`}
                >
                    <span className="grid size-5 shrink-0 place-items-center rounded-[4px] bg-[#e9583e] text-[10px] font-semibold leading-none text-white">{initial}</span>
                    {!compact ? <span className="hidden max-w-24 truncate text-left xl:block">{user.displayName}</span> : null}
                    <span className={cn("inline-flex min-w-0 items-center gap-1 tabular-nums", !compact && "xl:border-l xl:border-black/10 xl:pl-1.5 dark:xl:border-white/10")}>
                        <Coins className="size-3.5 shrink-0" />
                        <span className="truncate">{availableCredits}</span>
                        {!compact ? <span className="hidden 2xl:inline">积分</span> : null}
                        {hasFrozenCredits ? <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">({frozenCredits} 处理中)</span> : null}
                    </span>
                </button>
            </Dropdown>
            <RechargeModal open={rechargeOpen} onClose={() => setRechargeOpen(false)} />
        </>
    );
}
