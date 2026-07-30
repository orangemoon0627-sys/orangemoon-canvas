import { Ban, Check, CircleDollarSign, RefreshCw, Search, UserCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { App, Button, Form, Input, Modal, Result, Segmented, Space, Table, Tabs, Tag, Typography } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import {
    adjustAdminWallet,
    confirmAdminRecharge,
    fetchAdminRecharges,
    fetchAdminUsers,
    rejectAdminRecharge,
    updateAdminUserStatus,
    type AdminUser,
    type PaymentProvider,
    type RechargeOrder,
    type RechargeStatus,
} from "@/services/api/platform";
import { useAuthStore } from "@/stores/use-auth-store";
import { PaymentSettingsPanel } from "./payment-settings-panel";

const ADMIN_RECHARGES_KEY = ["platform", "admin", "recharges"] as const;
const ADMIN_USERS_KEY = ["platform", "admin", "users"] as const;

type ReviewState = { kind: "confirm" | "reject"; order: RechargeOrder } | null;
type AdjustmentState = { user: AdminUser } | null;

export default function AdminPage() {
    const user = useAuthStore((state) => state.user)!;
    if (user.role !== "ADMIN") return <Result status="403" title="无权访问" subTitle="这个页面只对管理员开放。" />;
    return <AdminWorkspace />;
}

function AdminWorkspace() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const currentUser = useAuthStore((state) => state.user)!;
    const [rechargeStatus, setRechargeStatus] = useState<RechargeStatus | "ALL">("PENDING");
    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [review, setReview] = useState<ReviewState>(null);
    const [adjustment, setAdjustment] = useState<AdjustmentState>(null);
    const [working, setWorking] = useState(false);
    const [reviewForm] = Form.useForm<{ externalReference?: string; reviewNote: string }>();
    const [adjustmentForm] = Form.useForm<{ amountCredits: string; reason: string }>();
    const rechargeQuery = useQuery({ queryKey: [...ADMIN_RECHARGES_KEY, rechargeStatus], queryFn: () => fetchAdminRecharges(rechargeStatus === "ALL" ? undefined : rechargeStatus) });
    const usersQuery = useQuery({ queryKey: [...ADMIN_USERS_KEY, search], queryFn: () => fetchAdminUsers(search) });

    useEffect(() => {
        if (review) reviewForm.resetFields();
    }, [review, reviewForm]);

    useEffect(() => {
        if (adjustment) adjustmentForm.resetFields();
    }, [adjustment, adjustmentForm]);

    const reviewOrder = (kind: "confirm" | "reject", order: RechargeOrder) => {
        setReview({ kind, order });
    };

    const submitReview = async (values: { externalReference?: string; reviewNote: string }) => {
        if (!review) return;
        setWorking(true);
        try {
            if (review.kind === "confirm") await confirmAdminRecharge(review.order.publicId, { externalReference: values.externalReference || "", reviewNote: values.reviewNote || undefined });
            else await rejectAdminRecharge(review.order.publicId, values.reviewNote);
            message.success(review.kind === "confirm" ? "充值已确认并入账" : "充值订单已驳回");
            setReview(null);
            await Promise.all([queryClient.invalidateQueries({ queryKey: ADMIN_RECHARGES_KEY }), queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY })]);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "审核失败");
        } finally {
            setWorking(false);
        }
    };

    const submitAdjustment = async (values: { amountCredits: string; reason: string }) => {
        if (!adjustment) return;
        setWorking(true);
        try {
            await adjustAdminWallet(adjustment.user.id, values);
            message.success("调账已写入账本");
            setAdjustment(null);
            await queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "调账失败");
        } finally {
            setWorking(false);
        }
    };

    const toggleStatus = async (target: AdminUser) => {
        const status = target.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
        try {
            await updateAdminUserStatus(target.id, status);
            message.success(status === "ACTIVE" ? "用户已启用" : "用户已停用");
            await queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "状态更新失败");
        }
    };

    const rechargeColumns = useMemo(() => [
        { title: "订单号", dataIndex: "publicId", width: 210, render: (value: string) => <Typography.Text copyable={{ text: value }} className="!font-mono !text-xs">{value}</Typography.Text> },
        { title: "用户", dataIndex: "user", width: 230, render: (owner: RechargeOrder["user"]) => owner ? <div className="min-w-0"><div className="truncate whitespace-nowrap">{owner.displayName}</div><div className="max-w-52 truncate whitespace-nowrap text-xs text-stone-500" title={owner.email}>{owner.email}</div></div> : "-" },
        { title: "方式", dataIndex: "provider", width: 110, render: providerLabel },
        { title: "金额", dataIndex: "amountCny", width: 100, render: (value: string) => <span className="tabular-nums">¥ {value}</span> },
        { title: "积分", dataIndex: "credits", width: 90 },
        { title: "状态", dataIndex: "status", width: 100, render: rechargeStatusTag },
        { title: "创建时间", dataIndex: "createdAt", width: 160, render: formatTime },
        { title: "支付流水", dataIndex: "externalReference", width: 160, render: (value: string | null) => value || "-" },
        { title: "操作", key: "actions", fixed: "right" as const, width: 150, render: (_: unknown, order: RechargeOrder) => order.status === "PENDING" ? <Space><Button type="link" size="small" icon={<Check className="size-3.5" />} onClick={() => reviewOrder("confirm", order)}>确认</Button><Button type="link" danger size="small" onClick={() => reviewOrder("reject", order)}>驳回</Button></Space> : null },
    ], []);

    const userColumns = useMemo(() => [
        { title: "用户", key: "user", width: 260, render: (_: unknown, target: AdminUser) => <div className="min-w-0"><div className="truncate whitespace-nowrap font-medium">{target.displayName}</div><div className="max-w-56 truncate whitespace-nowrap text-xs text-stone-500" title={target.email}>{target.email}</div></div> },
        { title: "角色", dataIndex: "role", width: 100, render: (value: AdminUser["role"]) => value === "ADMIN" ? <Tag color="gold">管理员</Tag> : <Tag>创作者</Tag> },
        { title: "状态", dataIndex: "status", width: 100, render: (value: AdminUser["status"]) => value === "ACTIVE" ? <Tag color="success">正常</Tag> : <Tag color="error">已停用</Tag> },
        { title: "可用积分", dataIndex: ["wallet", "availableCredits"], width: 110, render: (value: string) => <span className="tabular-nums">{value || "0"}</span> },
        { title: "冻结积分", dataIndex: ["wallet", "frozenCredits"], width: 110, render: (value: string) => <span className="tabular-nums">{value || "0"}</span> },
        { title: "注册时间", dataIndex: "createdAt", width: 160, render: formatTime },
        { title: "操作", key: "actions", fixed: "right" as const, width: 190, render: (_: unknown, target: AdminUser) => <Space><Button type="link" size="small" icon={<CircleDollarSign className="size-3.5" />} onClick={() => setAdjustment({ user: target })}>调账</Button><Button type="link" danger={target.status === "ACTIVE"} size="small" disabled={target.id === currentUser.id} icon={target.status === "ACTIVE" ? <Ban className="size-3.5" /> : <UserCheck className="size-3.5" />} onClick={() => void toggleStatus(target)}>{target.status === "ACTIVE" ? "停用" : "启用"}</Button></Space> },
    ], [currentUser.id]);

    return (
        <div className="h-full overflow-y-auto bg-background text-stone-900 dark:text-stone-100">
            <main className="mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-6 lg:px-8 lg:py-9">
                <header className="flex flex-col justify-between gap-4 border-b border-stone-200 pb-7 sm:flex-row sm:items-end dark:border-stone-800">
                    <div><h1 className="text-2xl font-semibold tracking-normal">管理后台</h1><p className="mt-1 text-sm text-stone-500 dark:text-stone-400">收款设置、充值审核、用户状态与积分调账</p></div>
                    <Button icon={<RefreshCw className="size-4" />} onClick={() => void queryClient.invalidateQueries({ queryKey: ["platform", "admin"] })}>刷新</Button>
                </header>
                <Tabs className="mt-5" items={[
                    {
                        key: "recharges",
                        label: `充值审核${rechargeQuery.data?.total ? ` (${rechargeQuery.data.total})` : ""}`,
                        children: <div className="py-3"><Segmented value={rechargeStatus} onChange={(value) => setRechargeStatus(value as RechargeStatus | "ALL")} options={[{ label: "待确认", value: "PENDING" }, { label: "全部", value: "ALL" }, { label: "已确认", value: "CONFIRMED" }, { label: "已驳回", value: "REJECTED" }]} /><Table<RechargeOrder> className="mt-5" rowKey="publicId" loading={rechargeQuery.isLoading} dataSource={rechargeQuery.data?.orders || []} columns={rechargeColumns} pagination={{ pageSize: 15, hideOnSinglePage: true }} scroll={{ x: 1250 }} /></div>,
                    },
                    {
                        key: "users",
                        label: `用户管理${usersQuery.data?.total ? ` (${usersQuery.data.total})` : ""}`,
                        children: <div className="py-3"><div className="flex max-w-md gap-2"><Input value={searchInput} prefix={<Search className="size-4 text-stone-400" />} allowClear placeholder="搜索邮箱或昵称" onChange={(event) => setSearchInput(event.target.value)} onPressEnter={() => setSearch(searchInput.trim())} /><Button onClick={() => setSearch(searchInput.trim())}>搜索</Button></div><Table<AdminUser> className="mt-5" rowKey="id" loading={usersQuery.isLoading} dataSource={usersQuery.data?.users || []} columns={userColumns} pagination={{ pageSize: 15, hideOnSinglePage: true }} scroll={{ x: 1100 }} /></div>,
                    },
                    { key: "payments", label: "收款设置", children: <PaymentSettingsPanel /> },
                ]} />
            </main>

            <Modal title={review?.kind === "confirm" ? "确认充值到账" : "驳回充值订单"} open={Boolean(review)} confirmLoading={working} okText={review?.kind === "confirm" ? "确认并入账" : "确认驳回"} okButtonProps={{ danger: review?.kind === "reject" }} onOk={() => reviewForm.submit()} onCancel={() => setReview(null)} destroyOnHidden>
                {review ? <><div className="mb-5 border-b border-stone-200 pb-4 text-sm dark:border-stone-800"><div className="font-mono text-xs">{review.order.publicId}</div><div className="mt-2 text-lg font-semibold">¥ {review.order.amountCny} / {review.order.credits} 积分</div></div><Form form={reviewForm} layout="vertical" requiredMark={false} onFinish={(values) => void submitReview(values)}>{review.kind === "confirm" ? <Form.Item name="externalReference" label="支付流水号" rules={[{ required: true, message: "请输入已核实的支付流水号" }, { min: 3 }]}><Input /></Form.Item> : null}<Form.Item name="reviewNote" label={review.kind === "confirm" ? "审核备注" : "驳回原因"} rules={review.kind === "reject" ? [{ required: true, message: "请填写驳回原因" }, { min: 2 }] : undefined}><Input.TextArea rows={3} maxLength={300} showCount /></Form.Item></Form></> : null}
            </Modal>

            <Modal title="积分调账" open={Boolean(adjustment)} confirmLoading={working} okText="写入账本" onOk={() => adjustmentForm.submit()} onCancel={() => setAdjustment(null)} destroyOnHidden>
                {adjustment ? <><p className="mb-5 text-sm text-stone-500">{adjustment.user.displayName} · 当前可用 {adjustment.user.wallet?.availableCredits || "0"} 积分</p><Form form={adjustmentForm} layout="vertical" requiredMark={false} onFinish={(values) => void submitAdjustment(values)}><Form.Item name="amountCredits" label="调整积分" extra="正数增加，负数扣减，最多支持三位小数" rules={[{ required: true, message: "请输入调整积分" }, { pattern: /^-?(0|[1-9]\d{0,5})(?:\.\d{1,3})?$/, message: "积分格式无效" }]}><Input inputMode="decimal" suffix="积分" /></Form.Item><Form.Item name="reason" label="调账原因" rules={[{ required: true, message: "请填写调账原因" }, { min: 2 }]}><Input.TextArea rows={3} maxLength={300} showCount /></Form.Item></Form></> : null}
            </Modal>
        </div>
    );
}

function providerLabel(provider: PaymentProvider) { return provider === "ALIPAY_MANUAL" ? "支付宝" : "微信支付"; }
function formatTime(value: string) { return dayjs(value).format("YYYY-MM-DD HH:mm"); }
function rechargeStatusTag(status: RechargeOrder["status"]) { const map = { PENDING: ["processing", "待确认"], CONFIRMED: ["success", "已确认"], REJECTED: ["error", "已驳回"], CANCELLED: ["default", "已取消"], EXPIRED: ["default", "已过期"] } as const; const [color, label] = map[status]; return <Tag color={color}>{label}</Tag>; }
