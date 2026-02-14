import { useOrg } from "../OrgContext";
import { Id } from "../../convex/_generated/dataModel";

export default function OrgSwitcher() {
    const { activeOrgId, setActiveOrgId, organizations } = useOrg();

    if (!organizations || organizations.length === 0) return null;

    return (
        <div className="flex items-center">
            <select
                value={activeOrgId || ""}
                onChange={(e) => setActiveOrgId(e.target.value as Id<"organizations">)}
                className="bg-transparent text-slate-900 text-sm font-bold focus:outline-none cursor-pointer hover:opacity-70 transition-opacity"
            >
                {organizations.map((org) => (
                    <option key={org._id} value={org._id} className="text-slate-900">
                        {org.name}
                    </option>
                ))}
            </select>
        </div>
    );
}
