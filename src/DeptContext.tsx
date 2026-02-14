import React, { createContext, useContext, useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

interface DeptContextType {
    activeDeptId: Id<"departments"> | null;
    setActiveDeptId: (id: Id<"departments"> | null) => void;
    createDepartment: (name: string) => Promise<Id<"departments">>;
    departments: any[] | undefined;
    isLoading: boolean;
}

const DeptContext = createContext<DeptContextType | undefined>(undefined);

import { useOrg } from "./OrgContext";

export const DeptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { activeOrgId } = useOrg();
    const createDept = useMutation(api.departments.create);
    const [activeDeptId, setActiveDeptId] = useState<Id<"departments"> | null>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("mission-control-dept-id");
            return saved ? (saved as Id<"departments">) : null;
        }
        return null;
    });

    // Fetch departments for the active org
    const departments = useQuery(api.departments.list, activeOrgId ? { orgId: activeOrgId } : "skip");

    useEffect(() => {
        if (!departments) return;

        if (departments.length === 0) {
            if (activeDeptId) {
                setActiveDeptId(null);
                localStorage.removeItem("mission-control-dept-id");
            }
            return;
        }

        const activeExists = activeDeptId
            ? departments.some((dept) => dept._id === activeDeptId)
            : false;

        // If no active dept OR stale active dept from previous org, pick first valid dept.
        if (!activeExists) {
            setActiveDeptId(departments[0]._id);
            localStorage.setItem("mission-control-dept-id", departments[0]._id);
        }
    }, [departments, activeDeptId]);

    useEffect(() => {
        if (activeDeptId) {
            localStorage.setItem("mission-control-dept-id", activeDeptId);
        }
    }, [activeDeptId]);

    const createDepartment = async (name: string): Promise<Id<"departments">> => {
        if (!activeOrgId) {
            throw new Error("Select an organization first.");
        }
        const trimmed = name.trim();
        if (!trimmed) {
            throw new Error("Department name is required.");
        }

        const baseSlug = trimmed
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
        const slug = `${baseSlug || "department"}-${Date.now().toString().slice(-6)}`;

        const id = await createDept({
            name: trimmed,
            slug,
            orgId: activeOrgId,
        });

        setActiveDeptId(id);
        localStorage.setItem("mission-control-dept-id", id);
        return id;
    };

    return (
        <DeptContext.Provider value={{ activeDeptId, setActiveDeptId, createDepartment, departments, isLoading: departments === undefined }}>
            {children}
        </DeptContext.Provider>
    );
};

export const useDept = () => {
    const context = useContext(DeptContext);
    if (context === undefined) {
        throw new Error("useDept must be used within a DeptProvider");
    }
    return context;
};
