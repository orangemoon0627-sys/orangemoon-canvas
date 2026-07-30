import { useEffect, useState } from "react";
import { Alert, App, Button, Form, Image, Input, Popconfirm, Skeleton, Switch, Tag, Upload, type UploadProps } from "antd";
import { QrCode, Save, Trash2, Upload as UploadIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PAYMENT_CONFIG_KEY } from "@/components/account/recharge-modal";
import {
    deleteAdminPaymentQr,
    fetchAdminPaymentSettings,
    updateAdminPaymentSetting,
    uploadAdminPaymentQr,
    type PaymentMethod,
} from "@/services/api/platform";

export const ADMIN_PAYMENT_SETTINGS_KEY = ["platform", "admin", "payment-settings"] as const;

export function PaymentSettingsPanel() {
    const query = useQuery({ queryKey: ADMIN_PAYMENT_SETTINGS_KEY, queryFn: fetchAdminPaymentSettings });
    if (query.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
    if (query.isError) return <Alert type="error" showIcon message="收款设置加载失败" description={query.error instanceof Error ? query.error.message : "请稍后重试"} />;

    return (
        <div className="py-2">
            <Alert className="mb-2" type="info" showIcon message="当前使用人工核款" description="用户扫码付款后，管理员必须在“充值审核”中核对真实流水并确认入账。收款码仅保存于平台数据库，不进入前端源码。" />
            {query.data?.methods.map((method) => <PaymentMethodEditor key={method.provider} method={method} />)}
        </div>
    );
}

function PaymentMethodEditor({ method }: { method: PaymentMethod }) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<{ enabled: boolean; payee: string; instructions: string }>();
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        form.setFieldsValue({ enabled: method.enabled, payee: method.payee, instructions: method.instructions });
    }, [form, method]);

    const refresh = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ADMIN_PAYMENT_SETTINGS_KEY }),
            queryClient.invalidateQueries({ queryKey: PAYMENT_CONFIG_KEY }),
        ]);
    };

    const save = async (values: { enabled: boolean; payee: string; instructions: string }) => {
        setSaving(true);
        try {
            await updateAdminPaymentSetting(method.provider, values);
            message.success(`${method.label}收款设置已保存`);
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const uploadQr = async (file: File) => {
        if (!(["image/png", "image/jpeg", "image/webp"] as string[]).includes(file.type)) {
            message.error("收款码只支持 PNG、JPEG 或 WebP");
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            message.error("收款码图片不能超过 2MB");
            return;
        }
        setUploading(true);
        try {
            const dataBase64 = await readFileBase64(file);
            await uploadAdminPaymentQr(method.provider, { mimeType: file.type as "image/png" | "image/jpeg" | "image/webp", dataBase64 });
            message.success(`${method.label}收款码已上传`);
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "上传失败");
        } finally {
            setUploading(false);
        }
    };

    const removeQr = async () => {
        setDeleting(true);
        try {
            await deleteAdminPaymentQr(method.provider);
            message.success(`${method.label}收款码已删除`);
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除失败");
        } finally {
            setDeleting(false);
        }
    };

    const beforeUpload: UploadProps["beforeUpload"] = (file) => {
        void uploadQr(file);
        return Upload.LIST_IGNORE;
    };
    const status = !method.qrUrl ? <Tag color="warning">缺少收款码</Tag> : method.enabled ? <Tag color="success">已开放</Tag> : <Tag>已停用</Tag>;

    return (
        <section className="grid gap-7 border-b border-stone-200 py-7 lg:grid-cols-[240px_minmax(0,560px)] dark:border-stone-800">
            <div>
                <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{method.label}</h2>{status}</div>
                <div className="grid aspect-square w-[200px] place-items-center overflow-hidden rounded-md border border-stone-200 bg-white dark:border-stone-700">
                    {method.qrUrl ? <Image src={method.qrUrl} alt={`${method.label}收款码`} width={200} height={200} className="object-contain" /> : <div className="text-center text-stone-400"><QrCode className="mx-auto size-10" /><div className="mt-2 text-xs">未上传收款码</div></div>}
                </div>
                <div className="mt-3 flex gap-2">
                    <Upload accept="image/png,image/jpeg,image/webp" maxCount={1} showUploadList={false} beforeUpload={beforeUpload} disabled={uploading}>
                        <Button loading={uploading} icon={<UploadIcon className="size-4" />}>{method.qrUrl ? "更换" : "上传"}</Button>
                    </Upload>
                    {method.qrUrl ? <Popconfirm title="删除这个收款码？" description="删除后用户将无法使用该支付方式创建新订单。" okText="删除" cancelText="取消" okButtonProps={{ danger: true, loading: deleting }} onConfirm={() => void removeQr()}><Button danger icon={<Trash2 className="size-4" />}>删除</Button></Popconfirm> : null}
                </div>
            </div>

            <Form form={form} layout="vertical" requiredMark={false} onFinish={(values) => void save(values)}>
                <Form.Item name="enabled" label="开放充值" valuePropName="checked" extra={method.qrUrl ? "关闭后用户不能创建该方式的新订单。" : "需要先上传收款码，用户端才会真正开放。"}>
                    <Switch checkedChildren="开放" unCheckedChildren="停用" />
                </Form.Item>
                <Form.Item name="payee" label="收款方" rules={[{ required: true, message: "请填写收款方" }, { max: 80 }]}><Input /></Form.Item>
                <Form.Item name="instructions" label="付款说明" rules={[{ required: true, message: "请填写付款说明" }, { min: 2 }, { max: 500 }]}><Input.TextArea rows={4} showCount maxLength={500} /></Form.Item>
                <Button type="primary" htmlType="submit" loading={saving} icon={<Save className="size-4" />}>保存设置</Button>
            </Form>
        </section>
    );
}

function readFileBase64(file: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("读取收款码失败"));
        reader.onload = () => {
            const result = String(reader.result || "");
            const separator = result.indexOf(",");
            if (separator < 0) reject(new Error("读取收款码失败"));
            else resolve(result.slice(separator + 1));
        };
        reader.readAsDataURL(file);
    });
}
