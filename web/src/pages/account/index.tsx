import { CircleDollarSign, Clock3, FolderOpen, RefreshCw, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Descriptions, Empty, Form, Input, Modal, Segmented, Space, Table, Tabs, Tag, Typography } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";

import { PaymentMethodDetail, PaymentOrderDetail } from "@/components/account/payment-details";
import { ModelPriceTable } from "@/components/account/model-price-table";
import { RechargeAmountField } from "@/components/account/recharge-amount-field";
import {
    cancelRecharge,
    createRecharge,
    fetchAgentTurns,
    fetchGenerationJobs,
    fetchLedger,
    fetchPaymentConfig,
    fetchRecharges,
    fetchWallet,
    type AgentTurn,
    type GenerationJob,
    type LedgerTransaction,
    type PaymentProvider,
    type RechargeOrder,
} from "@/services/api/platform";
import { useAuthStore } from "@/stores/use-auth-store";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { getOrangeMoonModelLabel, removeOrangeMoonInternalModelPrefix } from "@/lib/orange-moon-provider";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const WALLET_KEY = ["platform", "wallet"] as const;
const RECHARGES_KEY = ["platform", "recharges"] as const;
const LEDGER_KEY = ["platform", "ledger"] as const;
const JOBS_KEY = ["platform", "jobs"] as const;
const AGENT_TURNS_KEY = ["platform", "agent-turns"] as const;

export default function AccountPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const user = useAuthStore((state) => state.user)!;
    const updateWallet = useAuthStore((state) => state.updateWallet);
    const assets = useAssetStore((state) => state.assets);
    const bindAssets = useAssetStore((state) => state.bindOwner);
    const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
    const [submitting, setSubmitting] = useState(false);
    const [payOrder, setPayOrder] = useState<RechargeOrder | null>(null);
    const [form] = Form.useForm<{ amountCredits: string; provider: PaymentProvider; payerNote?: string }>();
    const walletQuery = useQuery({ queryKey: WALLET_KEY, queryFn: fetchWallet });
    const rechargeQuery = useQuery({ queryKey: RECHARGES_KEY, queryFn: () => fetchRecharges() });
    const paymentQuery = useQuery({ queryKey: ["platform", "payment-config"], queryFn: fetchPaymentConfig, staleTime: 5 * 60_000 });
    const ledgerQuery = useQuery({ queryKey: LEDGER_KEY, queryFn: () => fetchLedger(1, 100) });
    const jobsQuery = useQuery({ queryKey: JOBS_KEY, queryFn: fetchGenerationJobs });
    const agentTurnsQuery = useQuery({ queryKey: AGENT_TURNS_KEY, queryFn: fetchAgentTurns });
    const methods = useMemo(() => paymentQuery.data?.methods.filter((method) => method.enabled && method.ready) || [], [paymentQuery.data]);
    const selectedProvider = Form.useWatch("provider", form);
    const selectedMethod = methods.find((method) => method.provider === selectedProvider) || methods[0];

    useEffect(() => {
        if (walletQuery.data?.wallet) updateWallet(walletQuery.data.wallet);
    }, [updateWallet, walletQuery.data?.wallet]);

    useEffect(() => {
        if (!methods.length || methods.some((method) => method.provider === form.getFieldValue("provider"))) return;
        form.setFieldValue("provider", methods[0]?.provider);
    }, [form, methods]);

    const refresh = async () => {
        const result = await walletQuery.refetch();
        if (result.data?.wallet) updateWallet(result.data.wallet);
        await Promise.all([rechargeQuery.refetch(), ledgerQuery.refetch(), jobsQuery.refetch(), agentTurnsQuery.refetch(), bindAssets(`${user.id}:${activeWorkspaceId}`)]);
    };

    const submitRecharge = async (values: { amountCredits: string; provider: PaymentProvider; payerNote?: string }) => {
        setSubmitting(true);
        try {
            const result = await createRecharge(values);
            setPayOrder(result.order);
            form.resetFields(["amountCredits", "payerNote"]);
            await queryClient.invalidateQueries({ queryKey: RECHARGES_KEY });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "充值订单创建失败");
        } finally {
            setSubmitting(false);
        }
    };

    const cancel = async (order: RechargeOrder) => {
        try {
            await cancelRecharge(order.publicId);
            message.success("充值订单已取消");
            await queryClient.invalidateQueries({ queryKey: RECHARGES_KEY });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "取消失败");
        }
    };

    const wallet = walletQuery.data?.wallet || user.wallet;
    const rechargeColumns = rechargeTableColumns({ onPay: setPayOrder, onCancel: cancel });

    return (
        <div className="h-full overflow-y-auto bg-background text-stone-900 dark:text-stone-100">
            <main className="mx-auto w-full max-w-7xl px-5 py-7 sm:px-6 lg:px-8 lg:py-9">
                <header className="flex flex-col justify-between gap-5 border-b border-stone-200 pb-7 sm:flex-row sm:items-end dark:border-stone-800">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-normal">账户中心</h1>
                        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{user.displayName} · {user.email}</p>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} loading={walletQuery.isFetching} onClick={() => void refresh()}>刷新</Button>
                </header>

                <section className="grid border-b border-stone-200 py-7 sm:grid-cols-2 dark:border-stone-800">
                    <BalanceMetric icon={<WalletCards />} label="可用积分" value={wallet?.availableCredits || "0"} />
                    <BalanceMetric icon={<Clock3 />} label="冻结积分" value={wallet?.frozenCredits || "0"} divided />
                </section>

                <Tabs
                    className="mt-5"
                    defaultActiveKey="recharge"
                    more={{ trigger: "click" }}
                    items={[
                        {
                            key: "recharge",
                            label: "积分充值",
                            children: (
                                <div className="space-y-8 py-3">
                                    <section className="grid gap-8 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
                                        <div>
                                            <h2 className="text-base font-semibold">创建充值订单</h2>
                                            {methods.length ? (
                                                <Form form={form} layout="vertical" requiredMark={false} className="mt-5" initialValues={{ provider: methods[0]?.provider }} onFinish={(values) => void submitRecharge(values)}>
                                                    <Form.Item name="provider" label="支付方式" rules={[{ required: true }]}>
                                                        <Segmented block options={methods.map((method) => ({ label: method.label, value: method.provider }))} />
                                                    </Form.Item>
                                                    <RechargeAmountField form={form} />
                                                    <Form.Item name="payerNote" label="付款备注" rules={[{ max: 200 }]}><Input maxLength={200} /></Form.Item>
                                                    <Button type="primary" htmlType="submit" block size="large" loading={submitting} icon={<CircleDollarSign className="size-4" />}>创建订单</Button>
                                                </Form>
                                            ) : (
                                                <div className="mt-8">
                                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="收款方式尚未配置" />
                                                    {user.role === "ADMIN" ? <Button block onClick={() => navigate("/admin")}>前往管理后台配置收款码</Button> : <Alert type="warning" showIcon message="请联系管理员配置收款方式" />}
                                                </div>
                                            )}
                                        </div>
                                        <div className="border-t border-stone-200 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0 dark:border-stone-800">
                                            <h2 className="text-base font-semibold">收款信息</h2>
                                            {selectedMethod ? <PaymentMethodDetail method={selectedMethod} /> : <div className="mt-5 text-sm text-stone-500">请选择支付方式</div>}
                                            {paymentQuery.data?.notice ? <p className="mt-5 max-w-2xl text-xs leading-5 text-stone-500 dark:text-stone-400">{paymentQuery.data.notice}</p> : null}
                                        </div>
                                    </section>
                                    <section>
                                        <h2 className="mb-4 text-base font-semibold">充值订单</h2>
                                        <Table<RechargeOrder> rowKey="publicId" size="middle" loading={rechargeQuery.isLoading} dataSource={rechargeQuery.data?.orders || []} columns={rechargeColumns} pagination={{ pageSize: 10, hideOnSinglePage: true }} scroll={{ x: 900 }} />
                                    </section>
                                </div>
                            ),
                        },
                        { key: "pricing", label: "模型价格", children: <ModelPriceTable /> },
                        { key: "assets", label: `我的资产 (${assets.length})`, children: <AccountAssets items={assets} onOpen={() => navigate("/assets")} /> },
                        { key: "ledger", label: "积分流水", children: <LedgerTable loading={ledgerQuery.isLoading} items={ledgerQuery.data?.transactions || []} /> },
                        { key: "jobs", label: "使用记录", children: <UsageRecords generationJobs={jobsQuery.data?.jobs || []} agentTurns={agentTurnsQuery.data?.turns || []} generationLoading={jobsQuery.isLoading} agentLoading={agentTurnsQuery.isLoading} /> },
                        {
                            key: "profile",
                            label: "账户资料",
                            children: <Descriptions className="max-w-2xl py-4" column={1} items={[{ key: "name", label: "昵称", children: user.displayName }, { key: "email", label: "邮箱", children: user.email }, { key: "role", label: "角色", children: user.role === "ADMIN" ? "管理员" : "创作者" }, { key: "created", label: "注册时间", children: formatTime(user.createdAt) }]} />,
                        },
                    ]}
                />
            </main>

            <Modal title="充值付款" open={Boolean(payOrder)} footer={null} onCancel={() => setPayOrder(null)} destroyOnHidden>
                {payOrder ? <PaymentOrderDetail order={payOrder} method={paymentQuery.data?.methods.find((method) => method.provider === payOrder.provider)} /> : null}
            </Modal>
        </div>
    );
}

function BalanceMetric({ icon, label, value, divided = false }: { icon: React.ReactNode; label: string; value: string; divided?: boolean }) {
    return <div className={`flex items-center gap-4 py-2 ${divided ? "mt-5 border-t border-stone-200 pt-7 sm:mt-0 sm:border-l sm:border-t-0 sm:pl-9 sm:pt-2 dark:border-stone-800" : "sm:pr-9"}`}><span className="flex size-10 items-center justify-center rounded-md bg-stone-100 text-stone-700 [&_svg]:size-5 dark:bg-stone-900 dark:text-stone-200">{icon}</span><div><div className="text-xs text-stone-500 dark:text-stone-400">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div></div></div>;
}

function rechargeTableColumns({ onPay, onCancel }: { onPay: (order: RechargeOrder) => void; onCancel: (order: RechargeOrder) => Promise<void> }) {
    return [
        { title: "订单号", dataIndex: "publicId", width: 210, render: (value: string) => <Typography.Text copyable={{ text: value }} className="!font-mono !text-xs">{value}</Typography.Text> },
        { title: "方式", dataIndex: "provider", width: 120, render: (value: PaymentProvider) => value === "ALIPAY_MANUAL" ? "支付宝" : "微信支付" },
        { title: "支付金额", dataIndex: "amountCny", width: 110, render: (value: string) => <span className="tabular-nums">¥{value}</span> },
        { title: "积分", dataIndex: "credits", width: 100, render: (value: string) => <span className="tabular-nums">{value}</span> },
        { title: "状态", dataIndex: "status", width: 110, render: (value: RechargeOrder["status"]) => <StatusTag status={value} /> },
        { title: "创建时间", dataIndex: "createdAt", width: 170, render: formatTime },
        { title: "操作", key: "actions", fixed: "right" as const, width: 150, render: (_: unknown, order: RechargeOrder) => order.status === "PENDING" ? <Space><Button type="link" size="small" onClick={() => onPay(order)}>付款信息</Button><Button type="link" danger size="small" onClick={() => void onCancel(order)}>取消</Button></Space> : null },
    ];
}

function LedgerTable({ items, loading }: { items: LedgerTransaction[]; loading: boolean }) {
    return <Table<LedgerTransaction> className="py-3" rowKey="id" loading={loading} dataSource={items} pagination={{ pageSize: 15, hideOnSinglePage: true }} columns={[{ title: "时间", dataIndex: "createdAt", width: 170, render: formatTime }, { title: "类型", dataIndex: "type", width: 160, render: ledgerTypeLabel }, { title: "说明", dataIndex: "description" }, { title: "钱包变动", dataIndex: "entries", width: 260, render: (entries: LedgerTransaction["entries"]) => <Space orientation="vertical" size={2}>{entries.map((entry, index) => <span key={`${entry.account}-${index}`} className={`text-xs tabular-nums ${Number(entry.amountMilli) > 0 ? "text-emerald-600" : "text-stone-500"}`}>{accountLabel(entry.account)} {Number(entry.amountMilli) > 0 ? "+" : ""}{entry.amountCredits}</span>)}</Space> }]} scroll={{ x: 800 }} />;
}

function JobTable({ items, loading }: { items: GenerationJob[]; loading: boolean }) {
    return <Table<GenerationJob> className="py-3" rowKey="id" loading={loading} dataSource={items} pagination={{ pageSize: 15, hideOnSinglePage: true }} columns={[{ title: "时间", dataIndex: "createdAt", width: 170, render: formatTime }, { title: "任务号", dataIndex: "id", width: 230, render: (value: string) => <Typography.Text copyable={{ text: value }} className="!font-mono !text-xs">{value}</Typography.Text> }, { title: "模型", dataIndex: "model", width: 260, ellipsis: true, render: (value: string) => getOrangeMoonModelLabel(value) }, { title: "类型", dataIndex: "capability", width: 80, render: capabilityLabel }, { title: "用量", key: "usage", width: 130, render: (_: unknown, job: GenerationJob) => usageLabel(job) }, { title: "状态", dataIndex: "status", width: 110, render: generationStatus }, { title: "实际扣费", dataIndex: "chargedCredits", width: 100, render: (value: string) => <span className="tabular-nums">{value} 积分</span> }, { title: "结果", dataIndex: "error", width: 180, ellipsis: true, render: (value: string | null) => value ? removeOrangeMoonInternalModelPrefix(value) : "-" }]} scroll={{ x: 1260 }} />;
}

function AgentTurnTable({ items, loading }: { items: AgentTurn[]; loading: boolean }) {
    return <Table<AgentTurn> rowKey="id" loading={loading} dataSource={items} pagination={{ pageSize: 15, hideOnSinglePage: true }} columns={[{ title: "时间", dataIndex: "createdAt", width: 170, render: formatTime }, { title: "本轮号", dataIndex: "id", width: 230, render: (value: string) => <Typography.Text copyable={{ text: value }} className="!font-mono !text-xs">{value}</Typography.Text> }, { title: "模型", dataIndex: "model", width: 180, render: (value: string) => getOrangeMoonModelLabel(value) }, { title: "Token 用量", key: "tokens", width: 230, render: (_: unknown, turn: AgentTurn) => <span className="text-xs tabular-nums">输入 {turn.inputTokens.toLocaleString()} · 缓存 {turn.cachedInputTokens.toLocaleString()} · 输出 {turn.outputTokens.toLocaleString()}</span> }, { title: "状态", dataIndex: "status", width: 110, render: agentTurnStatus }, { title: "实际扣费", dataIndex: "chargedCredits", width: 110, render: (value: string) => <span className="tabular-nums">{value} 积分</span> }, { title: "结果", dataIndex: "error", width: 180, ellipsis: true, render: (value: string | null) => value || "-" }]} scroll={{ x: 1200 }} />;
}

function UsageRecords({ generationJobs, agentTurns, generationLoading, agentLoading }: { generationJobs: GenerationJob[]; agentTurns: AgentTurn[]; generationLoading: boolean; agentLoading: boolean }) {
    return <div className="space-y-8 py-3"><section><h2 className="mb-4 text-base font-semibold">Agent 对话</h2><AgentTurnTable items={agentTurns} loading={agentLoading} /></section><section><h2 className="mb-4 text-base font-semibold">生成任务</h2><JobTable items={generationJobs} loading={generationLoading} /></section></div>;
}

function AccountAssets({ items, onOpen }: { items: Asset[]; onOpen: () => void }) {
    return <div className="py-3"><div className="mb-4 flex items-center justify-between"><Typography.Text type="secondary">共 {items.length} 项</Typography.Text><Button icon={<FolderOpen className="size-4" />} onClick={onOpen}>打开资产库</Button></div><Table<Asset> rowKey="id" size="middle" dataSource={items.slice(0, 100)} pagination={{ pageSize: 15, hideOnSinglePage: true }} columns={[{ title: "更新时间", dataIndex: "updatedAt", width: 170, render: formatTime }, { title: "标题", dataIndex: "title", ellipsis: true }, { title: "类型", dataIndex: "kind", width: 90, render: assetKindLabel }, { title: "来源", dataIndex: "source", width: 180, ellipsis: true, render: (value?: string) => value || "-" }, { title: "标签", dataIndex: "tags", width: 260, render: (tags: string[]) => <Space size={[4, 4]} wrap>{(tags || []).slice(0, 4).map((tag) => <Tag key={tag}>{tag}</Tag>)}</Space> }]} scroll={{ x: 850 }} /></div>;
}

function StatusTag({ status }: { status: RechargeOrder["status"] }) {
    const options = { PENDING: ["processing", "待确认"], CONFIRMED: ["success", "已到账"], REJECTED: ["error", "已驳回"], CANCELLED: ["default", "已取消"], EXPIRED: ["default", "已过期"] } as const;
    const [color, label] = options[status];
    return <Tag color={color}>{label}</Tag>;
}

function generationStatus(status: GenerationJob["status"]) {
    const options = { RESERVED: ["processing", "已冻结"], SUBMITTED: ["processing", "生成中"], SUCCEEDED: ["success", "已完成"], FAILED: ["error", "失败已退"], RELEASED: ["default", "已释放"] } as const;
    const [color, label] = options[status];
    return <Tag color={color}>{label}</Tag>;
}

function agentTurnStatus(status: AgentTurn["status"]) {
    const options = { RESERVED: ["processing", "处理中"], SUCCEEDED: ["success", "已结算"], FAILED: ["error", "失败已退"] } as const;
    const [color, label] = options[status];
    return <Tag color={color}>{label}</Tag>;
}

function ledgerTypeLabel(value: string) { return ({ RECHARGE: "充值", ADMIN_ADJUSTMENT: "管理员调账", GENERATION_RESERVE: "生成冻结", GENERATION_SETTLE: "生成结算", GENERATION_RELEASE: "生成失败释放", AGENT_RESERVE: "Agent 冻结", AGENT_SETTLE: "Agent 结算", AGENT_RELEASE: "Agent 失败释放" } as Record<string, string>)[value] || value; }
function accountLabel(value: string) { return value === "wallet.available" ? "可用" : value === "wallet.frozen" ? "冻结" : value; }
function capabilityLabel(value: GenerationJob["capability"]) { return value === "image" ? "图片" : value === "video" ? "视频" : "音频"; }
function assetKindLabel(value: Asset["kind"]) { return value === "image" ? "图片" : value === "video" ? "视频" : "文本"; }
function usageLabel(job: GenerationJob) {
    const summary = job.requestSummary || {};
    if (job.capability === "image") return `${Number(summary.count || job.quantity || 0)} 张`;
    if (job.capability === "video") return `${Number(summary.duration || job.quantity || 0)} 秒`;
    return `${Number(summary.characterCount || job.quantity || 0).toLocaleString()} 字符`;
}
function formatTime(value: string) { return dayjs(value).format("YYYY-MM-DD HH:mm"); }
