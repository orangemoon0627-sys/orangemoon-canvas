import { ArrowRight, KeyRound, Mail, MoonStar, Sparkles, UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { App, Button, ConfigProvider, Form, Input, Segmented, Spin, theme as antdTheme } from "antd";

import { useAuthStore } from "@/stores/use-auth-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { bindAccountMediaOwner } from "@/services/account-media";

type AuthForm = { email: string; password: string; displayName?: string; confirmPassword?: string };

export function PlatformAuthGate({ children }: { children: ReactNode }) {
    const status = useAuthStore((state) => state.status);
    const userId = useAuthStore((state) => state.user?.id);
    const initialize = useAuthStore((state) => state.initialize);
    const expire = useAuthStore((state) => state.expire);

    useEffect(() => {
        void initialize();
    }, [initialize]);
    useEffect(() => {
        const onExpired = () => expire();
        window.addEventListener("orangemoon:session-expired", onExpired);
        return () => window.removeEventListener("orangemoon:session-expired", onExpired);
    }, [expire]);

    if (status === "checking") {
        return (
            <div className="flex h-dvh items-center justify-center bg-background">
                <Spin size="large" />
            </div>
        );
    }
    if (status === "anonymous") return <AuthScreen />;
    return userId ? <AccountDataGate userId={userId}>{children}</AccountDataGate> : null;
}

function AccountDataGate({ userId, children }: { userId: string; children: ReactNode }) {
    const bindAssets = useAssetStore((state) => state.bindOwner);
    const bindCanvas = useCanvasStore((state) => state.bindOwner);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let active = true;
        setReady(false);
        bindAccountMediaOwner(userId);
        void Promise.all([bindAssets(userId), bindCanvas(userId)]).finally(() => {
            if (active) setReady(true);
        });
        return () => { active = false; };
    }, [bindAssets, bindCanvas, userId]);

    if (!ready) return <div className="flex h-dvh items-center justify-center bg-background"><Spin size="large" /></div>;
    return children;
}

function AuthScreen() {
    const { message } = App.useApp();
    const [mode, setMode] = useState<"login" | "register">("login");
    const [submitting, setSubmitting] = useState(false);
    const login = useAuthStore((state) => state.login);
    const register = useAuthStore((state) => state.register);
    const [form] = Form.useForm<AuthForm>();

    const submit = async (values: AuthForm) => {
        if (mode === "register" && values.password !== values.confirmPassword) {
            form.setFields([{ name: "confirmPassword", errors: ["两次输入的密码不一致"] }]);
            return;
        }
        setSubmitting(true);
        try {
            if (mode === "login") await login({ email: values.email, password: values.password });
            else await register({ email: values.email, password: values.password, displayName: values.displayName });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        } finally {
            setSubmitting(false);
        }
    };

    const changeMode = (value: string | number) => {
        setMode(value as "login" | "register");
        form.resetFields();
    };

    return (
        <ConfigProvider
            theme={{
                algorithm: antdTheme.defaultAlgorithm,
                token: {
                    colorPrimary: "#e9583e",
                    colorPrimaryHover: "#d94b34",
                    colorPrimaryActive: "#c9402e",
                    colorText: "#1d1e1c",
                    colorTextSecondary: "#6d6d66",
                    colorBgContainer: "#ffffff",
                    colorBorder: "#d8d8d1",
                    colorBorderSecondary: "#e8e7e2",
                    borderRadius: 6,
                    controlHeightLG: 46,
                },
                components: {
                    Segmented: {
                        itemColor: "#6d6d66",
                        itemHoverColor: "#1d1e1c",
                        itemSelectedBg: "#ffffff",
                        itemSelectedColor: "#1d1e1c",
                        trackBg: "#e9e8e3",
                        trackPadding: 4,
                    },
                },
            }}
        >
            <div className="grid min-h-dvh bg-[#f5f4f0] lg:h-dvh lg:grid-cols-[minmax(560px,1.18fr)_minmax(440px,0.82fr)] lg:overflow-hidden">
                <section className="relative h-[220px] overflow-hidden bg-[#152326] text-white sm:h-[280px] lg:h-dvh">
                    <img src="/images/orange-moon-auth-studio.webp" alt="两位创作者与智能机甲在无限画布上共同制作故事" className="absolute inset-0 size-full object-cover object-[center_48%] lg:object-center" />
                    <div className="absolute inset-0 bg-[#0d1b1d]/20" />

                    <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-5 sm:px-8 sm:py-7 lg:px-12 lg:py-10">
                        <div className="flex items-center gap-3 [text-shadow:0_2px_14px_rgba(0,0,0,.65)]">
                            <span className="grid size-9 place-items-center rounded-lg border border-white/40 bg-[#152326]/55 backdrop-blur-sm">
                                <MoonStar className="size-5" />
                            </span>
                            <span className="text-lg font-semibold tracking-normal">橙月画布</span>
                        </div>
                        <span className="hidden items-center gap-2 text-sm font-medium text-white/90 sm:flex [text-shadow:0_2px_14px_rgba(0,0,0,.65)]">
                            <Sparkles className="size-4 text-[#ffd15c]" />
                            AI 视觉创作工作台
                        </span>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 px-5 pb-5 sm:px-8 sm:pb-7 lg:px-12 lg:pb-12">
                        <div className="max-w-[560px] [text-shadow:0_3px_20px_rgba(0,0,0,.82)]">
                            <span className="mb-3 hidden h-1 w-12 rounded-sm bg-[#ff7158] lg:block" />
                            <h1 className="max-w-[520px] text-2xl font-semibold leading-tight tracking-normal sm:text-3xl lg:text-[42px]">把脑海里的世界，变成可以播放的故事。</h1>
                            <p className="mt-4 hidden text-base leading-7 text-white/88 lg:block">灵感不必按顺序发生，故事会在画布上慢慢成形。</p>
                        </div>
                    </div>
                </section>

                <main className="relative flex min-h-[560px] items-center justify-center overflow-y-auto px-6 py-10 sm:px-10 lg:min-h-full lg:px-12 lg:py-12">
                    <div className="w-full max-w-[410px]">
                        <div className="mb-8 hidden items-center gap-2 text-sm font-semibold text-[#1d1e1c] lg:flex">
                            <span className="size-2 rounded-sm bg-[#2b9f8f]" />
                            橙月创作空间
                        </div>

                        <div className="mb-8 lg:mb-10">
                            <p className="mb-3 text-sm font-medium text-[#e9583e]">{mode === "login" ? "欢迎回来" : "新的创作从这里开始"}</p>
                            <h2 className="text-[30px] font-semibold leading-tight tracking-normal text-[#1d1e1c] sm:text-[34px]">{mode === "login" ? "继续你的画布" : "创建橙月账户"}</h2>
                            <p className="mt-3 text-[15px] leading-6 text-[#6d6d66]">{mode === "login" ? "登录后回到上次停下的位置。" : "注册后即可进入你的创作空间。"}</p>
                        </div>

                        <Segmented
                            block
                            value={mode}
                            options={[
                                { label: "登录", value: "login" },
                                { label: "注册", value: "register" },
                            ]}
                            onChange={changeMode}
                        />

                        <Form<AuthForm> form={form} layout="vertical" requiredMark={false} className="mt-7" onFinish={(values) => void submit(values)}>
                            {mode === "register" ? (
                                <Form.Item name="displayName" label="昵称" rules={[{ required: true, message: "请输入昵称" }, { max: 40 }]}>
                                    <Input prefix={<UserRound className="size-4 text-[#a2a19a]" />} size="large" autoComplete="name" placeholder="你的称呼" />
                                </Form.Item>
                            ) : null}
                            <Form.Item
                                name="email"
                                label="邮箱"
                                rules={[
                                    { required: true, message: "请输入邮箱" },
                                    { type: "email", message: "邮箱格式不正确" },
                                ]}
                            >
                                <Input prefix={<Mail className="size-4 text-[#a2a19a]" />} size="large" autoComplete="email" placeholder="name@example.com" />
                            </Form.Item>
                            <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }, ...(mode === "register" ? [{ min: 8, message: "密码至少 8 位" }] : [])]}>
                                <Input.Password prefix={<KeyRound className="size-4 text-[#a2a19a]" />} size="large" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "输入密码" : "至少 8 位"} />
                            </Form.Item>
                            {mode === "register" ? (
                                <Form.Item name="confirmPassword" label="确认密码" rules={[{ required: true, message: "请再次输入密码" }]}>
                                    <Input.Password prefix={<KeyRound className="size-4 text-[#a2a19a]" />} size="large" autoComplete="new-password" placeholder="再次输入密码" />
                                </Form.Item>
                            ) : null}
                            <Button htmlType="submit" type="primary" size="large" block loading={submitting} icon={<ArrowRight className="size-4" />} iconPosition="end" className="mt-2 font-medium">
                                {mode === "login" ? "进入画布" : "注册并进入"}
                            </Button>
                        </Form>

                        <p className="mt-8 text-center text-xs leading-5 text-[#94938b]">橙月画布 · 创作数据由你的账户独立保存</p>
                    </div>
                </main>
            </div>
        </ConfigProvider>
    );
}
