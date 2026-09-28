import { DataTypes, literal } from 'sequelize';

const attributes = {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    request_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'maintenance_requests', key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' },
    },
    technician_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'technicians', key: 'id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
    },
    role: {
        type: DataTypes.ENUM('lead', 'member'),
        allowNull: false,
    },
    hours: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: true,
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
    tableName: 'request_assignees',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            name: 'uq_request_assignees_request_technician',
            unique: true,
            fields: ['request_id', 'technician_id'],
        },
    ],
};

export function defineRequestAssigneeModel(sequelize) {
    return sequelize.define('RequestAssignee', attributes, options);
}
