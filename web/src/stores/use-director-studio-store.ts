import { create } from "zustand";

type DirectorStudioState = {
    nodeId: string;
    open: (nodeId: string) => void;
    close: () => void;
};

export const useDirectorStudioStore = create<DirectorStudioState>((set) => ({
    nodeId: "",
    open: (nodeId) => set({ nodeId }),
    close: () => set({ nodeId: "" }),
}));
