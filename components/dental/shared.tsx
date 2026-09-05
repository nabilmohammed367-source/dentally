import type { ReactNode } from 'react'
import { ArrowUpRight, Check, Circle, Headphones, MessageCircle, Phone, Bell, Users, HeartHandshake, ClipboardList } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
export const agentIcons = { reception: Headphones, support: MessageCircle, reminders: Bell, waitlist: Users, followup: HeartHandshake, operations: ClipboardList }
export function Status({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warning' }) { return <Badge variant={tone === 'good' ? 'secondary' : tone === 'warning' ? 'destructive' : 'outline'}>{tone === 'good' ? <Check data-icon="inline-start" /> : tone === 'warning' ? <Circle data-icon="inline-start" /> : null}{children}</Badge> }
export function Panel({ title, description, action, children, className }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
 return <Card className={cn('shadow-none', className)}><CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}{action && <CardAction>{action}</CardAction>}</CardHeader><CardContent>{children}</CardContent></Card>
}
export function ViewHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="page-title">{title}</h1><p className="page-subtitle mt-1">{description}</p></div>{action}</div> }
export function ViewLink({ children = 'View all', onClick }: { children?: ReactNode; onClick: () => void }) { return <Button variant="ghost" size="sm" onClick={onClick}>{children}<ArrowUpRight data-icon="inline-end" /></Button> }
export function ChannelIcon({ channel }: { channel: string }) { const Icon = channel === 'Phone' ? Phone : MessageCircle; return <Icon className="size-4" /> }
