import { useMemo, useState } from "react";
import { Alert, Segmented, Space, Table, Tag, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";

import { fetchAgentPricing, fetchProviderCatalog, type AgentPricing, type ProviderCatalogModel, type ProviderPriceExample } from "@/services/api/platform";
import { useAuthStore } from "@/stores/use-auth-store";

const CATALOG_KEY = ["platform", "provider-catalog"] as const;
type Filter = "all" | ProviderCatalogModel["capability"] | "agent";

export function ModelPriceTable() {
    const role = useAuthStore((state) => state.user?.role);
    const showCost = role === "ADMIN";
    const [filter, setFilter] = useState<Filter>("all");
    const query = useQuery({ queryKey: CATALOG_KEY, queryFn: fetchProviderCatalog, staleTime: 5 * 60_000 });
    const agentQuery = useQuery({ queryKey: ["platform", "agent-pricing"], queryFn: fetchAgentPricing, staleTime: 5 * 60_000 });
    const models = useMemo(() => (query.data?.models || []).filter((model) => filter === "all" || model.capability === filter), [filter, query.data?.models]);
    const columns = [
        { title: "产品", dataIndex: "label", width: 300, render: (_: string, model: ProviderCatalogModel) => <div><div className="font-medium">{model.label}</div><Typography.Text type="secondary" className="!text-xs">{model.description}</Typography.Text></div> },
        { title: "类型", dataIndex: "capability", width: 90, render: capabilityLabel },
        { title: "分辨率", key: "resolution", width: 190, render: (_: unknown, model: ProviderCatalogModel) => <Space size={[4, 4]} wrap>{(model.resolutions || (model.resolution ? [model.resolution] : [])).map((resolution) => <Tag key={resolution}>{resolution.toUpperCase()}</Tag>)}</Space> },
        { title: "档位", key: "tier", width: 90, render: (_: unknown, model: ProviderCatalogModel) => model.tier ? <Tag color={tierColor(model.tier)}>{tierLabel(model.tier)}</Tag> : "-" },
        ...(showCost ? [{ title: "上游成本", key: "cost", width: 210, render: (_: unknown, model: ProviderCatalogModel) => <ExampleValues model={model} mode="cost" /> }] : []),
        { title: "平台售价", key: "retail", width: 220, render: (_: unknown, model: ProviderCatalogModel) => <ExampleValues model={model} mode="retail" /> },
        ...(showCost ? [{ title: "实际毛利率", key: "margin", width: 150, render: (_: unknown, model: ProviderCatalogModel) => <ExampleValues model={model} mode="margin" /> }] : []),
    ];

    return (
        <div className="space-y-5 py-3">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <Segmented value={filter} onChange={(value) => setFilter(value as Filter)} options={[{ label: "全部", value: "all" }, { label: "图片", value: "image" }, { label: "视频", value: "video" }, { label: "配音", value: "audio" }, { label: "Agent", value: "agent" }]} />
                <Space size={8} wrap><Tag color="green">1 积分 = 1 元</Tag>{showCost && query.data ? <Tag color="orange">目标毛利率 {(query.data.pricing.targetGrossMargin * 100).toFixed(2)}%</Tag> : null}</Space>
            </div>
            {query.isError || agentQuery.isError ? <Alert type="error" showIcon message="价格表加载失败" description={query.error instanceof Error ? query.error.message : agentQuery.error instanceof Error ? agentQuery.error.message : "请稍后重试"} /> : null}
            {filter !== "agent" ? <Table<ProviderCatalogModel> rowKey="id" size="middle" loading={query.isLoading} dataSource={models} columns={columns} pagination={{ pageSize: 15, hideOnSinglePage: true }} scroll={{ x: showCost ? 1140 : 820 }} /> : null}
            {filter === "all" || filter === "agent" ? <AgentPriceTable pricing={agentQuery.data?.pricing} loading={agentQuery.isLoading} /> : null}
            <p className="text-xs leading-5 text-stone-500">每次下单前会按当前价格版本预授权，失败任务自动释放冻结积分；最终以该笔使用记录中的实际扣费为准。</p>
        </div>
    );
}

function AgentPriceTable({ pricing, loading }: { pricing?: AgentPricing; loading: boolean }) {
    const items = pricing ? [
        { key: "input", usage: "普通输入", price: pricing.inputCreditsPerMillion },
        { key: "cached", usage: "缓存输入", price: pricing.cachedInputCreditsPerMillion },
        { key: "output", usage: "输出", price: pricing.outputCreditsPerMillion },
    ] : [];
    return <section><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">GPT-5.6 Terra Agent</h3><Typography.Text type="secondary" className="!text-xs">按真实 Token 结算，运行前暂时冻结 {pricing?.reserveCredits || "-"} 积分</Typography.Text></div><Tag>每 100 万 Token</Tag></div><Table rowKey="key" size="small" loading={loading} dataSource={items} pagination={false} columns={[{ title: "用量类型", dataIndex: "usage" }, { title: "平台售价", dataIndex: "price", width: 180, render: (value: string) => <span className="tabular-nums">{value} 积分</span> }]} /></section>;
}

function ExampleValues({ model, mode }: { model: ProviderCatalogModel; mode: "retail" | "cost" | "margin" }) {
    const groups = [
        ...(model.resolutionExamples
            ? Object.entries(model.resolutionExamples).flatMap(([resolution, examples]) => (examples || []).map((example) => ({ resolution, example, variant: "基础" })))
            : model.examples.map((example) => ({ resolution: "", example, variant: "" }))),
        ...Object.entries(model.videoReferenceResolutionExamples || {}).flatMap(([resolution, examples]) => (examples || []).map((example) => ({ resolution, example, variant: "带参考视频" }))),
    ];
    return <Space orientation="vertical" size={2}>{groups.map(({ resolution, example, variant }) => <span key={`${variant}-${resolution}-${example.requestedQuantity}-${example.unit}`} className="text-xs tabular-nums">{variant ? `${variant} · ` : ""}{exampleLabel(model, example, resolution)} · {exampleValue(example, mode)}</span>)}</Space>;
}

function exampleLabel(model: ProviderCatalogModel, example: ProviderPriceExample, resolution = "") {
    if (model.capability === "image") return `${example.requestedQuantity} 张`;
    if (model.capability === "audio") return `${example.requestedQuantity.toLocaleString()} 字符`;
    const duration = model.billing.unit === "generation" ? "15 秒/条" : `${example.requestedQuantity} 秒`;
    return resolution ? `${resolution.toUpperCase()} · ${duration}` : duration;
}

function exampleValue(example: ProviderPriceExample, mode: "retail" | "cost" | "margin") {
    if (mode === "retail") return `${example.retailCredits} 积分`;
    if (mode === "cost") return example.upstreamCny === undefined ? "-" : `¥${formatNumber(example.upstreamCny, 4)}`;
    return example.grossMargin === undefined ? "-" : `${(example.grossMargin * 100).toFixed(1)}%`;
}

function capabilityLabel(value: ProviderCatalogModel["capability"]) { return value === "image" ? "图片" : value === "video" ? "视频" : "配音"; }
function tierLabel(value: NonNullable<ProviderCatalogModel["tier"]>) { return value === "fast" ? "Fast" : "标准"; }
function tierColor(value: NonNullable<ProviderCatalogModel["tier"]>) { return value === "fast" ? "cyan" : "default"; }
function formatNumber(value: number, digits: number) { return value.toFixed(digits).replace(/0+$/, "").replace(/\.$/, ""); }
