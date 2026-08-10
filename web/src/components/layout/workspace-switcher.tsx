import { Building2, Check, ChevronDown, Plus, Settings2, UserRound } from "lucide-react";
import { App, Button, Dropdown, Form, Input, Modal } from "antd";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useWorkspaceStore } from "@/stores/use-workspace-store";

export function WorkspaceSwitcher() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const workspaces = useWorkspaceStore((state) => state.workspaces);
    const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
    const select = useWorkspaceStore((state) => state.select);
    const createTeam = useWorkspaceStore((state) => state.createTeam);
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [form] = Form.useForm<{ name: string }>();
    const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId);

    const changeWorkspace = (workspaceId: string) => {
        if (workspaceId === activeWorkspaceId) return;
        select(workspaceId);
        if (/^\/canvas\/[^/]+/.test(pathname)) navigate("/canvas");
    };

    const submitCreate = async () => {
        const { name } = await form.validateFields();
        setCreating(true);
        try {
            await createTeam(name);
            setCreateOpen(false);
            form.resetFields();
            navigate("/team");
            message.success("团队空间已创建");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建失败");
        } finally {
            setCreating(false);
        }
    };

    return (
        <>
            <Dropdown
                trigger={["click"]}
                menu={{
                    selectedKeys: [activeWorkspaceId],
                    items: [
                        ...workspaces.map((workspace) => ({
                            key: workspace.id,
                            icon: workspace.kind === "TEAM" ? <Building2 className="size-4" /> : <UserRound className="size-4" />,
                            label: <span className="flex min-w-48 items-center justify-between gap-4"><span className="truncate">{workspace.name}</span>{workspace.id === activeWorkspaceId ? <Check className="size-4 text-[#e9583e]" /> : null}</span>,
                            onClick: () => changeWorkspace(workspace.id),
                        })),
                        { type: "divider" as const },
                        { key: "team-settings", icon: <Settings2 className="size-4" />, label: "团队管理", onClick: () => navigate("/team") },
                        { key: "create-team", icon: <Plus className="size-4" />, label: "新建团队空间", onClick: () => setCreateOpen(true) },
                    ],
                }}
            >
                <button type="button" className="ml-3 flex h-8 min-w-0 max-w-44 items-center gap-1.5 border-l border-stone-200 pl-3 text-sm text-stone-600 transition hover:text-stone-950 dark:border-stone-700 dark:text-stone-300 dark:hover:text-white" title={active?.name || "创作空间"}>
                    {active?.kind === "TEAM" ? <Building2 className="size-4 shrink-0" /> : <UserRound className="size-4 shrink-0" />}
                    <span className="hidden truncate sm:block">{active?.name || "创作空间"}</span>
                    <ChevronDown className="size-3.5 shrink-0" />
                </button>
            </Dropdown>

            <Modal title="新建团队空间" open={createOpen} okText="创建" cancelText="取消" confirmLoading={creating} onOk={() => void submitCreate()} onCancel={() => setCreateOpen(false)} destroyOnHidden>
                <Form form={form} layout="vertical" className="pt-3">
                    <Form.Item name="name" label="团队名称" rules={[{ required: true, message: "请输入团队名称" }, { max: 80, message: "最多 80 个字" }]}>
                        <Input autoFocus placeholder="例如：橙月动画组" onPressEnter={() => void submitCreate()} />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}
