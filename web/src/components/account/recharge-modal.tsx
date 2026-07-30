import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Form, Input, Modal, Segmented, Skeleton } from "antd";
import { CircleDollarSign, ReceiptText } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { PaymentOrderDetail } from "@/components/account/payment-details";
import { RechargeAmountField } from "@/components/account/recharge-amount-field";
import { createRecharge, fetchPaymentConfig, type PaymentProvider, type RechargeOrder } from "@/services/api/platform";
import { useAuthStore } from "@/stores/use-auth-store";

export const PAYMENT_CONFIG_KEY = ["platform", "payment-config"] as const;

type RechargeForm = { amountCredits: string; provider: PaymentProvider; payerNote?: string };

export function RechargeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const user = useAuthStore((state) => state.user);
    const [form] = Form.useForm<RechargeForm>();
    const [submitting, setSubmitting] = useState(false);
    const [order, setOrder] = useState<RechargeOrder | null>(null);
    const paymentQuery = useQuery({ queryKey: PAYMENT_CONFIG_KEY, queryFn: fetchPaymentConfig, enabled: open, staleTime: 60_000 });
    const methods = useMemo(() => paymentQuery.data?.methods.filter((method) => method.enabled && method.ready) || [], [paymentQuery.data]);
    const provider = Form.useWatch("provider", form);
    const method = methods.find((item) => item.provider === (order?.provider || provider)) || methods[0];

    useEffect(() => {
        if (!open || !methods.length || methods.some((item) => item.provider === form.getFieldValue("provider"))) return;
        form.setFieldValue("provider", methods[0]?.provider);
    }, [form, methods, open]);

    const close = () => {
        setOrder(null);
        form.resetFields();
        onClose();
    };

    const submit = async (values: RechargeForm) => {
        setSubmitting(true);
        try {
            const result = await createRecharge(values);
            setOrder(result.order);
            await queryClient.invalidateQueries({ queryKey: ["platform", "recharges"] });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "充值订单创建失败");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal title={order ? "扫码付款" : "积分充值"} open={open} footer={null} width={560} onCancel={close} destroyOnHidden>
            {order ? (
                <>
                    <PaymentOrderDetail order={order} method={method} />
                    <Alert className="mt-5" type="info" showIcon message="付款后等待管理员确认" description="请在转账备注中填写订单号。到账核实后积分会自动进入账户，无需上传付款截图。" />
                    <div className="mt-5 flex justify-end gap-2">
                        <Button onClick={() => { close(); navigate("/account"); }} icon={<ReceiptText className="size-4" />}>查看充值订单</Button>
                        <Button type="primary" onClick={close}>我知道了</Button>
                    </div>
                </>
            ) : paymentQuery.isLoading ? (
                <Skeleton active paragraph={{ rows: 5 }} />
            ) : methods.length ? (
                <Form<RechargeForm> form={form} layout="vertical" requiredMark={false} onFinish={(values) => void submit(values)}>
                    <Form.Item name="provider" label="支付方式" rules={[{ required: true }]}>
                        <Segmented block options={methods.map((item) => ({ label: item.label, value: item.provider }))} />
                    </Form.Item>
                    <RechargeAmountField form={form} />
                    <Form.Item name="payerNote" label="付款备注（选填）" rules={[{ max: 200 }]}><Input maxLength={200} placeholder="便于管理员核对付款人" /></Form.Item>
                    <Alert type="info" showIcon message={`收款方：${method?.payee || "橙月画布"}`} description="创建订单后显示收款码、应付金额和唯一订单号。" />
                    <Button className="mt-5" type="primary" htmlType="submit" block size="large" loading={submitting} icon={<CircleDollarSign className="size-4" />}>创建订单并显示收款码</Button>
                </Form>
            ) : (
                <Alert
                    type="warning"
                    showIcon
                    message="收款通道尚未配置"
                    description="当前没有可用的支付宝或微信收款码，请联系管理员在管理后台完成收款设置。"
                    action={user?.role === "ADMIN" ? <Button size="small" onClick={() => { close(); navigate("/admin"); }}>管理后台</Button> : undefined}
                />
            )}
        </Modal>
    );
}
