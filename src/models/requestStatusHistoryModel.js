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
    old_status: {
        type: DataTypes.STRING(20),
        allowNull: true, // null при первом создании заявки
    },
    new_status: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    author: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    comment: {
        type: DataTypes.STRING(500),
        allowNull: true,
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP'),
    },
};

const options = {
    tableName: 'request_status_history',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false, // append-only: обновлений у записи нет
};

export function defineRequestStatusHistoryModel(sequelize) {
    return sequelize.define('RequestStatusHistory', attributes, options);
}
