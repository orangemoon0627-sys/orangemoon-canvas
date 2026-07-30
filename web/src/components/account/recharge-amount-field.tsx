import { Button, Form, Input } from "antd";
import type { FormInstance } from "antd";

const PRESET_AMOUNTS = [50, 100, 200, 500, 1000];

export function RechargeAmountField<T extends { amountCredits: string }>({ form }: { form: FormInstance<T> }) {
    const amountForm = form as unknown as FormInstance<{ amountCredits: string }>;
    const amount = Form.useWatch("amountCredits", form) || "";
    return (
        <Form.Item label="充值金额" required extra="1 元 = 1 积分，充值和到账数量完全一致">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {PRESET_AMOUNTS.map((value) => (
                    <Button key={value} type={amount === String(value) ? "primary" : "default"} onClick={() => amountForm.setFieldValue("amountCredits", String(value))}>
                        {value} 元
                    </Button>
                ))}
            </div>
            <Form.Item name="amountCredits" noStyle rules={[{ required: true, message: "请输入充值金额" }, { pattern: /^[1-9]\d{0,5}(?:\.\d{1,2})?$/, message: "最低 1 元，最多保留两位小数" }]}>
                <Input className="mt-3" size="large" inputMode="decimal" prefix="¥" suffix="积分" placeholder="自定义金额" />
            </Form.Item>
            {amount && /^[1-9]\d{0,5}(?:\.\d{1,2})?$/.test(amount) ? <div className="mt-2 text-xs tabular-nums text-stone-500">支付 ¥{amount}，到账 {amount} 积分</div> : null}
        </Form.Item>
    );
}
