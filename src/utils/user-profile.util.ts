import { ObjectId } from "mongodb";
import { AppDataSource } from "../data-source";
import { Admin } from "../entity/Admin";
import { AdminUser } from "../entity/AdminUser";
import { Role } from "../entity/Role.Permission";
import { Modules } from "../entity/Modules";

export async function getUserProfileWithPermissions(userId: string, userType: string) {
    const adminRepo = AppDataSource.getMongoRepository(Admin);
    const adminUserRepo = AppDataSource.getMongoRepository(AdminUser);
    const moduleRepo = AppDataSource.getMongoRepository(Modules);

    let profileData: any = null;

    if (userType === "ADMIN") {
        const admin = await adminRepo.findOneBy({ _id: new ObjectId(userId), isDelete: 0 });
        if (!admin) return null;

        // Fetch all active modules for dynamic full permissions
        const allModules = await moduleRepo.find({ where: { isActive: 1, isDelete: 0 } });
        const permissions = allModules.map(m => ({
            moduleId: m.id,
            moduleName: m.name,
            actions: { view: true, add: true, edit: true, delete: true }
        }));

        profileData = {
            id: admin.id,
            name: admin.name,
            phoneNumber: admin.phoneNumber,
            email: admin.email,
            userType: "ADMIN",
            role: { id: null, name: "Super Admin", code: "SUPER_ADMIN" },
            permissions
        };
    } else {
        const data = await adminUserRepo.aggregate([
            {
                $match: {
                    _id: new ObjectId(userId),
                    isActive: 1,
                    isDelete: 0
                }
            },
            {
                $lookup: {
                    from: "roles",
                    localField: "roleId",
                    foreignField: "_id",
                    as: "role"
                }
            },
            { $unwind: { path: "$role", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "modules",
                    localField: "role.permissions.moduleId",
                    foreignField: "_id",
                    as: "modules"
                }
            },
            {
                $addFields: {
                    permissions: {
                        $map: {
                            input: "$role.permissions",
                            as: "perm",
                            in: {
                                moduleId: "$$perm.moduleId",
                                moduleName: {
                                    $let: {
                                        vars: {
                                            module: {
                                                $arrayElemAt: [
                                                    {
                                                        $filter: {
                                                            input: "$modules",
                                                            as: "m",
                                                            cond: {
                                                                $eq: ["$$m._id", "$$perm.moduleId"]
                                                            }
                                                        }
                                                    },
                                                    0
                                                ]
                                            }
                                        },
                                        in: "$$module.name"
                                    }
                                },
                                actions: "$$perm.actions"
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    phoneNumber: 1,
                    email: 1,
                    roleId: 1,
                    role: {
                        id: "$role._id",
                        name: "$role.name",
                        code: "$role.code"
                    },
                    permissions: 1
                }
            }
        ]).toArray();

        if (data.length === 0) return null;
        const profile = data[0];
        profileData = {
            id: profile._id,
            name: profile.name,
            phoneNumber: profile.phoneNumber,
            email: profile.email,
            userType: "ADMIN_USER",
            role: profile.role,
            roleId: profile.roleId,
            permissions: profile.permissions || []
        };
    }

    return profileData;
}
