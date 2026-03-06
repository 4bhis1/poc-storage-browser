"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Cloud, RefreshCw, Trash2, Plus, CheckCircle2, AlertCircle, Clock, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LinkAwsAccountForm } from "@/components/aws-accounts/link-aws-account-form"
import { useToast } from "@/components/ui/use-toast"
import { triggerAccountValidation } from "@/app/actions/aws-accounts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface AwsAccount {
  id: string
  awsAccountId: string
  region: string
  friendlyName: string
  roleArn: string
  status: string
  lastValidatedAt: string | null
  createdAt: string
}

interface Props {
  tenantId: string
  tenantName: string
  isHubTenant: boolean
  awsAccounts: AwsAccount[]
}

const statusIcon = (status: string) => {
  switch (status) {
    case "CONNECTED":         return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case "FAILED":
    case "DISCONNECTED":      return <AlertCircle className="h-4 w-4 text-red-500" />
    default:                  return <Clock className="h-4 w-4 text-amber-500 animate-pulse" />
  }
}

const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "CONNECTED":         return "default"
    case "FAILED":
    case "DISCONNECTED":      return "destructive"
    default:                  return "secondary"
  }
}

const POLLING_STATUSES = ["PENDING_VALIDATION", "CREATING"]
const POLL_INTERVAL_MS = 3000

export function TenantAwsAccountTab({ tenantId, tenantName, isHubTenant, awsAccounts }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [showForm, setShowForm]               = useState(false)
  const [validatingId, setValidatingId]       = useState<string | null>(null)
  const [accountToDelete, setAccountToDelete] = useState<AwsAccount | null>(null)
  const [isDeleting, setIsDeleting]           = useState(false)
  const [pollingIds, setPollingIds]           = useState<Set<string>>(() => {
    // Start polling immediately for any accounts already in a transient state
    return new Set(awsAccounts.filter(a => POLLING_STATUSES.includes(a.status)).map(a => a.id))
  })
  const pollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const stopPolling = (accountId: string) => {
    const timer = pollTimers.current.get(accountId)
    if (timer) { clearTimeout(timer); pollTimers.current.delete(accountId) }
    setPollingIds(prev => { const next = new Set(prev); next.delete(accountId); return next })
  }

  const pollStatus = async (accountId: string) => {
    try {
      const res = await fetch(`/api/aws-accounts/${accountId}`)
      const data = await res.json()
      if (!data.success) { stopPolling(accountId); return }
      const status: string = data.account?.status
      if (!POLLING_STATUSES.includes(status)) {
        // Status resolved — refresh server component data and stop
        stopPolling(accountId)
        router.refresh()
      } else {
        // Still pending — schedule next poll
        const timer = setTimeout(() => pollStatus(accountId), POLL_INTERVAL_MS)
        pollTimers.current.set(accountId, timer)
      }
    } catch {
      stopPolling(accountId)
    }
  }

  const startPolling = (accountId: string) => {
    if (pollTimers.current.has(accountId)) return
    setPollingIds(prev => new Set(prev).add(accountId))
    const timer = setTimeout(() => pollStatus(accountId), POLL_INTERVAL_MS)
    pollTimers.current.set(accountId, timer)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => { pollTimers.current.forEach(t => clearTimeout(t)) }
  }, [])

  const activeAccount = awsAccounts.find(a =>
    ["CONNECTED", "CREATING", "PENDING_VALIDATION"].includes(a.status)
  )

  const handleValidate = async (accountId: string) => {
    setValidatingId(accountId)
    const res = await triggerAccountValidation(accountId)
    if (res.success) {
      toast({ title: "Validation Started", description: "AWS Account validation queued." })
      startPolling(accountId)
    } else {
      toast({ title: "Error", description: res.error || "Validation trigger failed.", variant: "destructive" })
    }
    setValidatingId(null)
  }

  const handleDelete = async () => {
    if (!accountToDelete) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/aws-accounts/${accountToDelete.id}`, { method: "DELETE" })
      const result = await res.json()
      if (result.success) {
        toast({ title: "Account Deleted", description: "AWS Account connection removed." })
        setAccountToDelete(null)
        router.refresh()
      } else {
        toast({ title: "Deletion Failed", description: result.error || "Failed to delete.", variant: "destructive" })
        setAccountToDelete(null)
      }
    } catch {
      toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" })
      setAccountToDelete(null)
    } finally {
      setIsDeleting(false)
    }
  }

  // Hub tenant — no BYOC
  if (isHubTenant) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Cloud className="h-10 w-10 mb-3 text-muted-foreground/40" />
          <p className="font-medium">Hub Tenant</p>
          <p className="text-sm text-muted-foreground mt-1">
            This tenant uses the central AWS environment directly.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Show inline integration form
  if (showForm) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setShowForm(false)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <LinkAwsAccountForm
          tenants={[{ id: tenantId, name: tenantName }]}
          preselectedTenantId={tenantId}
          onSuccess={() => { setShowForm(false); router.refresh() }}
        />
      </div>
    )
  }

  // No account linked yet
  if (awsAccounts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
            <Cloud className="h-7 w-7 text-muted-foreground/60" />
          </div>
          <h3 className="font-semibold text-lg mb-1">No AWS Account Integrated</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            Link a customer AWS account to enable Bring-Your-Own-Cloud storage for <strong>{tenantName}</strong>.
          </p>
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Integrate AWS Account
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Account(s) exist — show details
  return (
    <>
      <div className="space-y-4">
        {awsAccounts.map(account => (
          <Card key={account.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300">
                    <Cloud className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {account.friendlyName}
                      {statusIcon(account.status)}
                    </CardTitle>
                    <CardDescription className="font-mono text-xs mt-0.5">
                      {account.awsAccountId}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(account.status)}>
                    {account.status.replace("_", " ")}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    title="Re-validate connection"
                    disabled={
                      validatingId === account.id ||
                      account.status === "CREATING" ||
                      account.status === "PENDING_VALIDATION"
                    }
                    onClick={() => handleValidate(account.id)}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${validatingId === account.id || pollingIds.has(account.id) ? "animate-spin" : ""}`} />
                    {validatingId === account.id ? "Validating…" : pollingIds.has(account.id) ? "Checking…" : "Re-validate"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    title="Delete connection"
                    onClick={() => setAccountToDelete(account)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm p-4 bg-muted/40 rounded-lg">
                <div>
                  <span className="text-muted-foreground block mb-1 text-xs">Region</span>
                  <span className="font-medium">{account.region}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1 text-xs">Linked On</span>
                  <span className="font-medium">{new Date(account.createdAt).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1 text-xs">Last Validated</span>
                  <span className="font-medium">
                    {account.lastValidatedAt
                      ? new Date(account.lastValidatedAt).toLocaleString()
                      : "Never"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1 text-xs">Role ARN</span>
                  <span className="font-mono text-xs truncate block max-w-[200px]" title={account.roleArn}>
                    {account.roleArn}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Only allow adding a new account if none is active */}
        {!activeAccount && (
          <Button variant="outline" onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Integrate AWS Account
          </Button>
        )}
      </div>

      <AlertDialog open={!!accountToDelete} onOpenChange={(open) => !open && setAccountToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete AWS Account connection?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the connection to <strong>{accountToDelete?.awsAccountId}</strong>.
              This action will be blocked if active S3 buckets are still mapped to this account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={(e) => { e.preventDefault(); handleDelete() }}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
