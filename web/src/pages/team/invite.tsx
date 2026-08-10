import { Building2, CheckCircle2 } from "lucide-react";
import { Alert, App, Button, Spin } from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { acceptWorkspaceInvite, previewWorkspaceInvite, type WorkspaceRole } from "@/services/api/platform";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const roleLabels: Record<WorkspaceRole, string> = { OWNER: "所有者", ADMIN: "管理员", EDITOR: "编辑者", VIEWER: "查看者" };

export default function TeamInvitePage() {
    const { message } = App.useApp();
    const { token = "" } = useParams();
    const navigate = useNavigate();
    const refresh = useWorkspaceStore((state) => state.refresh);
    const select = useWorkspaceStore((state) => state.select);
    const [invite, setInvite] = useState<Awaited<ReturnType<typeof previewWorkspaceInvite>>["invite"] | null>(null);
    const [error, setError] = useState("");
    const [accepting, setAccepting] = useState(false);

    useEffect(() => {
        previewWorkspaceInvite(token).then((result) => setInvite(result.invite)).catch((reason) => setError(reason instanceof Error ? reason.message : "邀请链接无效"));
    }, [token]);

    const accept = async () => {
        setAccepting(true);
        try {
            const result = await acceptWorkspaceInvite(token);
            await refresh();
            select(result.workspace.id);
            message.success("已加入团队空间");
            navigate("/team", { replace: true });
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "加入团队失败");
        } finally { setAccepting(false); }
    };

    return <div className="grid h-full place-items-center overflow-y-auto bg-background px-6 py-12"><div className="w-full max-w-md border-y border-stone-200 py-10 text-center dark:border-stone-800">{error ? <Alert type="error" showIcon message={error} /> : invite ? <><Building2 className="mx-auto size-10 text-[#e9583e]" /><h1 className="mt-5 text-2xl font-semibold">加入 {invite.workspace.name}</h1><p className="mt-3 text-sm leading-6 text-stone-500">{invite.invitedBy} 邀请你以“{roleLabels[invite.role]}”身份加入。加入后可访问团队共享画布、素材和 Agent 对话。</p><Button className="mt-7" type="primary" size="large" icon={<CheckCircle2 className="size-4" />} loading={accepting} onClick={() => void accept()}>接受邀请</Button></> : <Spin size="large" />}</div></div>;
}
