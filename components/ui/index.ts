/**
 * UI PRIMITIVLARI — yagona manba.
 *
 * Qoida: agar shu yerda mavjud primitiv ishni bajara olsa, sahifada qo'lda
 * `<button>`/`<div className="fixed inset-0">` yozilmaydi. Primitiv yetarli
 * bo'lmasa — uni KENGAYTIRING, forklamang. `CONSISTENCY.md:184`:
 * "shared komponentlar forklashdan qiyinroq bo'ladigan darajada chuqur bo'lsin".
 */

export { Modal, type ModalProps, type ModalSize } from "./Modal";
export { ConfirmProvider, useConfirm, type ConfirmOptions } from "./ConfirmDialog";
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button";
export { Field, type FieldProps } from "./Field";
export { Select, type SelectProps, type SelectSize } from "./Select";
export { CompanySelect, type CompanySelectProps, type CompanyOption } from "./CompanySelect";
export { Badge, TONE_COLORS, type BadgeProps, type BadgeTone } from "./Badge";
export { Avatar, initialsOf, type AvatarProps, type AvatarSize } from "./Avatar";
export { IdentityCell, type IdentityCellProps } from "./IdentityCell";
export { Card, type CardProps } from "./Card";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { Skeleton, SkeletonTable, type SkeletonProps } from "./Skeleton";
export { DataTable, type DataTableProps, type DataColumn } from "./DataTable";
export { Pagination, pageSlice, pageWindow, type PaginationProps } from "./Pagination";
export { TableToolbar, type ViewMode } from "./TableToolbar";
export { Tabs, TabPanel, type TabItem, type TabsProps, type TabPanelProps } from "./Tabs";
export { MonthPicker } from "./MonthPicker";
export { Money, type MoneyProps, type MoneyTone } from "./Money";
export { StatStrip, type StatStripProps, type StatItem } from "./StatStrip";
export { MobileRowCard, type MobileRowCardProps, type MobileField } from "./MobileRowCard";
export { ModalLayer, type ModalLayerProps } from "./ModalLayer";
export { DateField, displayDate, type DateFieldProps } from "./DateField";
export { MoneyField } from "./MoneyField";
export { PageHeader } from "./PageHeader";
export { KpiCard } from "./KpiCard";
export { Tooltip, type TooltipProps } from "./Tooltip";
