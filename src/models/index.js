import { defineEquipmentModel } from './equipmentModel.js';
import { defineEquipmentPassportModel } from './equipmentPassportModel.js';
import { defineMaintenanceRequestModel } from './maintenanceRequestModel.js';
import { defineRequestAssigneeModel } from './requestAssigneeModel.js';
import { defineRequestStatusHistoryModel } from './requestStatusHistoryModel.js';
import { defineSiteModel } from './siteModel.js';
import { defineTechnicianModel } from './technicianModel.js';

export function initModels(sequelize) {
    const Site = defineSiteModel(sequelize);
    const Equipment = defineEquipmentModel(sequelize);
    const EquipmentPassport = defineEquipmentPassportModel(sequelize);
    const MaintenanceRequest = defineMaintenanceRequestModel(sequelize);
    const Technician = defineTechnicianModel(sequelize);
    const RequestAssignee = defineRequestAssigneeModel(sequelize);
    const RequestStatusHistory = defineRequestStatusHistoryModel(sequelize);

    Site.hasMany(Equipment, { foreignKey: 'site_id', as: 'equipment' });
    Equipment.belongsTo(Site, { foreignKey: 'site_id', as: 'site' });

    Equipment.hasOne(EquipmentPassport, { foreignKey: 'equipment_id', as: 'passport' });
    EquipmentPassport.belongsTo(Equipment, { foreignKey: 'equipment_id', as: 'equipment' });

    Equipment.hasMany(MaintenanceRequest, { foreignKey: 'equipment_id', as: 'maintenanceRequests' });
    MaintenanceRequest.belongsTo(Equipment, { foreignKey: 'equipment_id', as: 'equipment' });

    MaintenanceRequest.hasMany(RequestStatusHistory, { foreignKey: 'request_id', as: 'statusHistory' });
    RequestStatusHistory.belongsTo(MaintenanceRequest, { foreignKey: 'request_id', as: 'request' });

    MaintenanceRequest.hasMany(RequestAssignee, { foreignKey: 'request_id', as: 'assignees' });
    RequestAssignee.belongsTo(MaintenanceRequest, { foreignKey: 'request_id', as: 'request' });

    Technician.hasMany(RequestAssignee, { foreignKey: 'technician_id', as: 'assignees' });
    RequestAssignee.belongsTo(Technician, { foreignKey: 'technician_id', as: 'technician' });

    MaintenanceRequest.belongsToMany(Technician, {
        through: RequestAssignee,
        foreignKey: 'request_id',
        otherKey: 'technician_id',
        as: 'technicians',
    });
    Technician.belongsToMany(MaintenanceRequest, {
        through: RequestAssignee,
        foreignKey: 'technician_id',
        otherKey: 'request_id',
        as: 'maintenanceRequests',
    });

    return {
        Site,
        Equipment,
        EquipmentPassport,
        MaintenanceRequest,
        Technician,
        RequestAssignee,
        RequestStatusHistory,
    };
}
