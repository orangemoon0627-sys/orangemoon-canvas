import { Building2, Copy, Link2, PencilLine, Plus, RefreshCw, Trash2, UserPlus, Users } from "lucide-react";
import { App, Button, Empty, Form, Input, Modal, Select, Space, Table, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";

import {
    addWorkspaceMember,
    createWorkspaceInvite,
    fetchWorkspaceInvites,
    fetchWorkspaceMembers,
    removeWorkspaceMember,
    renameWorkspace,
    revokeWorkspaceInvite,
    updateWorkspaceMember,
    type WorkspaceInvite,
    type WorkspaceMember,
    type WorkspaceRole,
} from "@/services/api/platform";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type MemberForm = { email: string; role: Exclude<WorkspaceRole, "OWNER"> };
const roleOptions = [
    { value: "ADMIN", label: "管理员" },
    { value: "EDITOR", label: "编辑者" },
    { value: "VIEWER", label: "查看者" },
] as const;
const roleLabels: Record<WorkspaceRole, string> = { OWNER: "所有者", ADMIN: "管理员", EDITOR: "编辑者", VIEWER: "查看者" };

export default function TeamPage() {
    const { message, modal } = App.useApp();
    const user = useAuthStore((state) => state.user)!;
    const workspaces = useWorkspaceStore((state) => state.workspaces);
    const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
    const selectWorkspace = useWorkspaceStore((state) => state.select);
    const createTeam = useWorkspaceStore((state) => state.createTeam);
    const refreshWorkspaces = useWorkspaceStore((state) => state.refresh);
    const workspace = workspaces.find((item) => item.id === activeWorkspaceId);
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
    const [loading, setLoading] = useState(false);
    const [memberOpen, setMemberOpen] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [memberForm] = Form.useForm<MemberForm>();
    const [inviteForm] = Form.useForm<MemberForm>();
    const [createForm] = Form.useForm<{ name: string }>();
    const canManage = workspace?.role === "OWNER" || workspace?.role === "ADMIN";

    const load = useCallback(async () => {
        if (!workspace || workspace.kind !== "TEAM") {
            setMembers([]);
            setInvites([]);
            return;
        }
        setLoading(true);
        try {
            const memberResult = await fetchWorkspaceMembers(workspace.id);
            setMembers(memberResult.members);
            setInvites(canManage ? (await fetchWorkspaceInvites(workspace.id)).invites : []);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "团队信息加载失败");
        } finally {
            setLoading(false);
        }
    }, [canManage, message, workspace]);

    useEffect(() => { void load(); }, [load]);

    const addMember = async () => {
        if (!workspace) return;
        const values = await memberForm.validateFields();
        setSubmitting(true);
        try {
            await addWorkspaceMember(workspace.id, values);
            setMemberOpen(false);
            memberForm.resetFields();
            await Promise.all([load(), refreshWorkspaces()]);
            message.success("成员已加入团队");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "添加失败");
        } finally { setSubmitting(false); }
    };

    const createInvite = async () => {
        if (!workspace) return;
        const values = await inviteForm.validateFields();
        setSubmitting(true);
        try {
            const result = await createWorkspaceInvite(workspace.id, values);
            await navigator.clipboard.writeText(result.invite.url);
            setInviteOpen(false);
            inviteForm.resetFields();
            await load();
            message.success("邀请链接已复制，有效期 7 天");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "邀请创建失败");
        } finally { setSubmitting(false); }
    };

    const createWorkspace = async () => {
        const values = await createForm.validateFields();
        setSubmitting(true);
        try {
            await createTeam(values.name);
            setCreateOpen(false);
            createForm.resetFields();
            message.success("团队空间已创建");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建失败");
        } finally { setSubmitting(false); }
    };

    const editName = () => {
        if (!workspace || !canManage) return;
        let name = workspace.name;
        modal.confirm({
            title: "修改团队名称",
            content: <Input className="mt-4" defaultValue={name} maxLength={80} onChange={(event) => { name = event.target.value; }} />,
            okText: "保存",
            cancelText: "取消",
            onOk: async () => {
                if (!name.trim()) throw new Error("请输入团队名称");
                await renameWorkspace(workspace.id, name);
                await refreshWorkspaces();
            },
        });
    };

    const changeRole = async (member: WorkspaceMember, role: Exclude<WorkspaceRole, "OWNER">) => {
        if (!workspace) return;
        try {
            await updateWorkspaceMember(workspace.id, member.userId, role);
            await load();
            message.success("角色已更新");
        } catch (error) { message.error(error instanceof Error ? error.message : "更新失败"); }
    };

    const removeMember = (member: WorkspaceMember) => {
        if (!workspace) return;
        modal.confirm({
            title: `移除 ${member.displayName}？`,
            content: "移除后，该成员将不能再访问此空间的画布、素材和对话记录。",
            okText: "移除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                await removeWorkspaceMember(workspace.id, member.userId);
                await Promise.all([load(), refreshWorkspaces()]);
            },
        });
    };

    const memberColumns = useMemo(() => [
        { title: "成员", key: "member", render: (_: unknown, member: WorkspaceMember) => <div><div className="font-medium text-stone-900 dark:text-stone-100">{member.displayName}{member.userId === user.id ? "（我）" : ""}</div><div className="mt-0.5 text-xs text-stone-500">{member.email}</div></div> },
        { title: "角色", dataIndex: "role", width: 150, render: (role: WorkspaceRole, member: WorkspaceMember) => role === "OWNER" || !canManage ? <Tag>{roleLabels[role]}</Tag> : <Select size="small" value={role} options={[...roleOptions]} className="w-28" disabled={workspace?.role === "ADMIN" && role === "ADMIN"} onChange={(value) => void changeRole(member, value)} /> },
        { title: "加入时间", dataIndex: "joinedAt", width: 150, responsive: ["md" as const], render: (value: string) => dayjs(value).format("YYYY-MM-DD") },
        { title: "", key: "actions", width: 54, render: (_: unknown, member: WorkspaceMember) => member.role === "OWNER" || !canManage ? null : <Button type="text" danger icon={<Trash2 className="size-4" />} title="移除成员" onClick={() => removeMember(member)} /> },
    ], [canManage, user.id, workspace?.role]);

    return (
        <div className="h-full overflow-y-auto bg-background text-stone-900 dark:text-stone-100">
            <main className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-7 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8 lg:py-9">
                <aside className="border-b border-stone-200 pb-6 lg:border-b-0 lg:border-r lg:pr-7 dark:border-stone-800">
                    <div className="mb-4 flex items-center justify-between"><h1 className="text-lg font-semibold">创作空间</h1><Button type="text" icon={<Plus className="size-4" />} title="新建团队" onClick={() => setCreateOpen(true)} /></div>
                    <div className="space-y-1">
                        {workspaces.map((item) => <button key={item.id} type="button" onClick={() => selectWorkspace(item.id)} className={`flex w-full items-center gap-3 px-2 py-2.5 text-left text-sm transition ${item.id === activeWorkspaceId ? "bg-stone-100 font-medium text-stone-950 dark:bg-stone-800 dark:text-white" : "text-stone-600 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-900"}`}>
                            {item.kind === "TEAM" ? <Building2 className="size-4 shrink-0" /> : <Users className="size-4 shrink-0" />}<span className="truncate">{item.name}</span>
                        </button>)}
                    </div>
                </aside>

                <section className="min-w-0">
                    <header className="flex flex-col justify-between gap-4 border-b border-stone-200 pb-6 sm:flex-row sm:items-end dark:border-stone-800">
                        <div><div className="flex items-center gap-2"><h2 className="text-2xl font-semibold">{workspace?.name || "团队空间"}</h2>{canManage && workspace?.kind === "TEAM" ? <Button type="text" icon={<PencilLine className="size-4" />} title="修改名称" onClick={editName} /> : null}</div><p className="mt-1 text-sm text-stone-500">{workspace?.kind === "TEAM" ? `${workspace.memberCount} 位成员 · ${workspace.projectCount} 个画布 · ${workspace.assetCount} 项资产` : "你的个人画布、素材和 Agent 对话"}</p></div>
                        {workspace?.kind === "TEAM" ? <Space wrap><Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void load()}>刷新</Button>{canManage ? <><Button icon={<Link2 className="size-4" />} onClick={() => setInviteOpen(true)}>邀请链接</Button><Button type="primary" icon={<UserPlus className="size-4" />} onClick={() => setMemberOpen(true)}>添加成员</Button></> : null}</Space> : <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>新建团队空间</Button>}
                    </header>

                    {workspace?.kind === "TEAM" ? <>
                        <div className="py-5"><Typography.Title level={4} className="!mb-1">团队成员</Typography.Title><Typography.Text type="secondary">画布和素材在团队内共享，生成费用从实际操作人的个人积分扣除。</Typography.Text></div>
                        <Table rowKey="userId" loading={loading} columns={memberColumns} dataSource={members} pagination={false} scroll={{ x: 620 }} />
                        {canManage ? <div className="mt-9"><Typography.Title level={4} className="!mb-1">待处理邀请</Typography.Title><Typography.Text type="secondary">邀请只能由指定邮箱接受，7 天后自动失效。</Typography.Text><div className="mt-4 divide-y divide-stone-200 border-y border-stone-200 dark:divide-stone-800 dark:border-stone-800">{invites.filter((invite) => !invite.acceptedAt && !invite.revokedAt && dayjs(invite.expiresAt).isAfter(dayjs())).map((invite) => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><div className="text-sm font-medium">{invite.email}</div><div className="mt-0.5 text-xs text-stone-500">{roleLabels[invite.role]} · {dayjs(invite.expiresAt).format("MM-DD HH:mm")} 到期</div></div><Button type="text" danger icon={<Trash2 className="size-4" />} onClick={() => void revokeWorkspaceInvite(workspace.id, invite.id).then(load)}>撤销</Button></div>)}{!invites.some((invite) => !invite.acceptedAt && !invite.revokedAt && dayjs(invite.expiresAt).isAfter(dayjs())) ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待处理邀请" /> : null}</div></div> : null}
                    </> : <Empty className="py-24" image={Empty.PRESENTED_IMAGE_SIMPLE} description="个人空间不需要管理成员" />}
                </section>
            </main>

            <MemberModal title="添加已注册成员" open={memberOpen} form={memberForm} submitting={submitting} onOk={addMember} onCancel={() => setMemberOpen(false)} />
            <MemberModal title="创建邀请链接" open={inviteOpen} form={inviteForm} submitting={submitting} onOk={createInvite} onCancel={() => setInviteOpen(false)} hint={<span className="inline-flex items-center gap-1"><Copy className="size-3.5" />创建后自动复制链接</span>} />
            <Modal title="新建团队空间" open={createOpen} okText="创建" cancelText="取消" confirmLoading={submitting} onOk={() => void createWorkspace()} onCancel={() => setCreateOpen(false)} destroyOnHidden><Form form={createForm} layout="vertical" className="pt-3"><Form.Item name="name" label="团队名称" rules={[{ required: true, message: "请输入团队名称" }, { max: 80 }]}><Input autoFocus placeholder="例如：橙月动画组" /></Form.Item></Form></Modal>
        </div>
    );
}

function MemberModal({ title, open, form, submitting, onOk, onCancel, hint }: { title: string; open: boolean; form: ReturnType<typeof Form.useForm<MemberForm>>[0]; submitting: boolean; onOk: () => Promise<void>; onCancel: () => void; hint?: React.ReactNode }) {
    return <Modal title={title} open={open} okText="确认" cancelText="取消" confirmLoading={submitting} onOk={() => void onOk()} onCancel={onCancel} destroyOnHidden><Form form={form} layout="vertical" initialValues={{ role: "EDITOR" }} className="pt-3"><Form.Item name="email" label="账户邮箱" rules={[{ required: true, message: "请输入邮箱" }, { type: "email", message: "邮箱格式不正确" }]}><Input placeholder="name@example.com" /></Form.Item><Form.Item name="role" label="空间角色" rules={[{ required: true }]}><Select options={[...roleOptions]} /></Form.Item>{hint ? <div className="text-xs text-stone-500">{hint}</div> : null}</Form></Modal>;
}
