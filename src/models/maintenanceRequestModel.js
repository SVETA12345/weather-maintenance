import { DataTypes, literal } from 'sequelize';

const attributes = {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    equipment_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'equipment', key: 'id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
    },
    title: {
        type: DataTypes.STRING(120),
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING(2000),
        allowNull: true,
    },
    priority: {
        type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('new', 'in_progress', 'done', 'rejected'),
        allowNull: false,
        defaultValue: 'new',
    },
    planned_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    planned_labor_hours: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
        defaultValue: null,
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP'),
    },
    updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP'),
    },
};

const options = {
    tableName: 'maintenance_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
};

export function defineMaintenanceRequestModel(sequelize) {
    return sequelize.define('MaintenanceRequest', attributes, options);
}
