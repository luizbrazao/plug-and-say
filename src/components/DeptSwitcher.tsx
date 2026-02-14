import React from "react";
import { useDept } from "../DeptContext";

const DeptSwitcher: React.FC = () => {
    const { departments, activeDeptId, setActiveDeptId } = useDept();

    if (!departments) return null;

    return (
        <div className="flex items-center">
            <select
                value={activeDeptId ?? ""}
                onChange={(e) => {
                    setActiveDeptId(e.target.value as any);
                }}
                className="bg-transparent text-slate-900 text-sm font-bold focus:outline-none cursor-pointer hover:opacity-70 transition-opacity"
            >
                {departments.map((d) => (
                    <option key={d._id} value={d._id} className="text-slate-900">
                        {d.name}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default DeptSwitcher;
