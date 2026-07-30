import { Alert, Button, Descriptions, Image, Space, Typography } from "antd";
import { Copy } from "lucide-react";
import copy from "copy-to-clipboard";
import dayjs from "dayjs";

import type { PaymentMethod, RechargeOrder } from "@/services/api/platform";

export function PaymentMethodDetail({ method, compact = false }: { method: PaymentMethod; compact?: boolean }) {
    return (
        <div className={`flex flex-col gap-5 ${compact ? "" : "mt-5 sm:flex-row sm:items-start"}`}>
            {method.qrUrl ? (
                <Image src={method.qrUrl} alt={`${method.label}收款码`} width={compact ? 200 : 176} height={compact ? 200 : 176} className="object-contain" />
            ) : (
                <Alert type="warning" showIcon message="收款码尚未配置" description="管理员上传收款码后，该支付方式才会开放。" />
            )}
            <Descriptions
                size="small"
                column={1}
                items={[
                    { key: "provider", label: "方式", children: method.label },
                    { key: "payee", label: "收款方", children: method.payee },
                    { key: "instructions", label: "说明", children: method.instructions },
                ]}
            />
        </div>
    );
}

export function PaymentOrderDetail({ order, method }: { order: RechargeOrder; method?: PaymentMethod }) {
    return (
        <div className="pt-2">
            {method?.qrUrl ? <div className="mb-5 text-center"><Image src={method.qrUrl} alt={`${method.label}收款码`} width={220} height={220} className="object-contain" /></div> : <Alert className="mb-5" type="error" showIcon message="收款码不可用" description="请勿付款，联系管理员完成收款配置。" />}
            <Descriptions column={1} size="small" items={[
                { key: "id", label: "订单号", children: <Space>{order.publicId}<Button type="text" size="small" icon={<Copy className="size-3.5" />} onClick={() => copy(order.publicId)} aria-label="复制订单号" /></Space> },
                { key: "amount", label: "应付金额", children: `¥ ${order.amountCny}` },
                { key: "credits", label: "到账积分", children: order.credits },
                { key: "payee", label: "收款方", children: method?.payee || "橙月画布" },
                { key: "expires", label: "有效期至", children: dayjs(order.expiresAt).format("YYYY-MM-DD HH:mm") },
            ]} />
            <Typography.Paragraph type="secondary" className="!mb-0 !mt-4 !text-xs !leading-5">{method?.instructions || "转账时填写订单号，到账后由管理员确认。"}</Typography.Paragraph>
        </div>
    );
}
