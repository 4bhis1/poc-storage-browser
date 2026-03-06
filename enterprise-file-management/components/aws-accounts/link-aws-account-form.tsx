"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Copy, Download, ExternalLink, CheckCircle2, ChevronRight, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface Tenant {
    id: string
    name: string
}

interface CFNData {
    templateBody: string
    roleArn: string
    externalId: string
}

export function LinkAwsAccountForm({ tenants, preselectedTenantId, onSuccess }: { 
    tenants: Tenant[]
    preselectedTenantId?: string
    onSuccess?: () => void
}) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const urlTenantId = preselectedTenantId || searchParams.get("tenantId")
    const { toast } = useToast()

    const [step, setStep] = useState(1)
    
    // Form State
    const [tenantId, setTenantId] = useState(urlTenantId || "")
    const [awsAccountId, setAwsAccountId] = useState("")
    const [friendlyName, setFriendlyName] = useState("")
    const [description, setDescription] = useState("")
    const [region, setRegion] = useState("us-east-1")
    
    // CFN State
    const [cfnData, setCfnData] = useState<CFNData | null>(null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Ensure we start with the URL param if valid
    useEffect(() => {
        if (urlTenantId && tenants.some(t => t.id === urlTenantId)) {
            setTenantId(urlTenantId)
        }
    }, [urlTenantId, tenants])

    const handleGenerateTemplate = async () => {
        if (!awsAccountId || awsAccountId.length !== 12 || !/^\d+$/.test(awsAccountId)) {
            toast({ title: "Invalid AWS Account ID", description: "Must be a 12-digit number." })
            return
        }
        if (!tenantId) {
            toast({ title: "Tenant Required", description: "Please select a tenant." })
            return
        }

        setIsGenerating(true)
        try {
            const res = await fetch("/api/aws-accounts/template", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ awsAccountId })
            })
            const result = await res.json()
            if (result.success) {
                setCfnData(result.data)
                setStep(2)
            } else {
                toast({ title: "Error", description: result.error || "Failed to generate template." })
            }
        } catch (err: any) {
            toast({ title: "Error", description: "An unexpected error occurred." })
        }
        setIsGenerating(false)
    }

    const downloadTemplate = () => {
        if (!cfnData) return
        const blob = new Blob([cfnData.templateBody], { type: "text/yaml" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `cams-integration-${awsAccountId}.yaml`
        a.click()
        URL.revokeObjectURL(url)
    }

    const copyTemplate = () => {
        if (!cfnData) return
        navigator.clipboard.writeText(cfnData.templateBody)
        toast({ title: "Copied!", description: "Template copied to clipboard." })
    }

    const launchStack = () => {
        if (!cfnData) return
        const consoleUrl = `https://console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/create/review`
        window.open(consoleUrl, "_blank")
    }

    const handleSubmitValidation = async () => {
        setIsSubmitting(true)
        try {
            const payload = {
                tenantId,
                awsAccountId,
                region,
                roleArn: cfnData?.roleArn,
                externalId: cfnData?.externalId,
                friendlyName,
                description
            }

            const res = await fetch("/api/aws-accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            })
            const result = await res.json()

            if (result.success) {
                toast({ title: "Account Linked", description: "AWS Account is successfully registered and validation has started." })
                if (onSuccess) {
                    onSuccess()
                } else {
                    router.push("/superadmin/aws-accounts")
                }
                router.refresh()
            } else {
                toast({ title: "Error", description: result.error || "Failed to link account." })
            }
        } catch (err: any) {
            toast({ title: "Error", description: "An unexpected error occurred." })
        }
        setIsSubmitting(false)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Onboarding Process</CardTitle>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground mt-2">
                    <span className={step >= 1 ? "text-primary font-semibold" : ""}>1. Basic Info</span>
                    <ChevronRight className="h-4 w-4" />
                    <span className={step >= 2 ? "text-primary font-semibold" : ""}>2. Setup AWS</span>
                    <ChevronRight className="h-4 w-4" />
                    <span className={step >= 3 ? "text-primary font-semibold" : ""}>3. Save & Validate</span>
                </div>
            </CardHeader>
            <CardContent>
                
                {/* STEP 1: Basic Info */}
                {step === 1 && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="tenant">Target Tenant</Label>
                            <Select value={tenantId} onValueChange={setTenantId} disabled={!!urlTenantId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a tenant" />
                                </SelectTrigger>
                                <SelectContent>
                                    {tenants.map(t => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {urlTenantId && <p className="text-xs text-muted-foreground">Pre-selected from URL</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="friendlyName">Account Name</Label>
                            <Input
                                id="friendlyName"
                                placeholder="e.g. Production AWS Account"
                                value={friendlyName}
                                onChange={(e) => setFriendlyName(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
                            <Textarea
                                id="description"
                                placeholder="Purpose of this account link..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="awsAccountId">AWS Account ID</Label>
                            <Input 
                                id="awsAccountId" 
                                placeholder="e.g. 123456789012" 
                                value={awsAccountId}
                                onChange={(e) => setAwsAccountId(e.target.value.replace(/\D/g, ''))}
                                maxLength={12}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="region">Primary Region</Label>
                            <Select value={region} onValueChange={setRegion}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select region" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="us-east-1">US East (N. Virginia)</SelectItem>
                                    <SelectItem value="us-east-2">US East (Ohio)</SelectItem>
                                    <SelectItem value="us-west-1">US West (N. California)</SelectItem>
                                    <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                                    <SelectItem value="eu-west-1">Europe (Ireland)</SelectItem>
                                    <SelectItem value="eu-central-1">Europe (Frankfurt)</SelectItem>
                                    <SelectItem value="ap-south-1">Asia Pacific (Mumbai)</SelectItem>
                                    <SelectItem value="ap-southeast-1">Asia Pacific (Singapore)</SelectItem>
                                    <SelectItem value="ap-southeast-2">Asia Pacific (Sydney)</SelectItem>
                                    <SelectItem value="ap-northeast-1">Asia Pacific (Tokyo)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Button 
                            className="mt-4" 
                            onClick={handleGenerateTemplate}
                            disabled={isGenerating || awsAccountId.length !== 12 || !tenantId || !friendlyName}
                        >
                            {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Generate CloudFormation Template
                        </Button>
                    </div>
                )}

                {/* STEP 2: Setup AWS (CloudFormation) */}
                {step === 2 && cfnData && (
                    <div className="space-y-6">
                        <div className="bg-muted p-4 rounded-md text-sm font-mono overflow-auto max-h-64 whitespace-pre">
                            {cfnData.templateBody}
                        </div>

                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={copyTemplate}>
                                <Copy className="mr-2 h-4 w-4" /> Copy
                            </Button>
                            <Button variant="secondary" onClick={downloadTemplate}>
                                <Download className="mr-2 h-4 w-4" /> Download .yaml
                            </Button>
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-950 p-4 border border-blue-200 dark:border-blue-900 rounded-md">
                            <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Instructions</h4>
                            <ol className="list-decimal list-inside text-sm text-blue-700 dark:text-blue-400 space-y-1">
                                <li>Log into the target AWS account (ID: <strong>{awsAccountId}</strong>) via AWS Console.</li>
                                <li>Click <strong>Launch Stack</strong> below to open CloudFormation.</li>
                                <li>Upload the generated template or paste the contents.</li>
                                <li>Follow the wizard and acknowledge IAM resource creation.</li>
                                <li>Wait for the stack creation to reach <strong>CREATE_COMPLETE</strong>.</li>
                                <li>Once deployed, click Next to finalize linking.</li>
                            </ol>
                            <Button className="mt-4" onClick={launchStack} variant="outline">
                                <ExternalLink className="mr-2 h-4 w-4" /> Launch Stack in AWS
                            </Button>
                        </div>

                        <div className="flex justify-between mt-4">
                            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                            <Button onClick={() => setStep(3)}>Next Step</Button>
                        </div>
                    </div>
                )}

                {/* STEP 3: Save & Validate */}
                {step === 3 && (
                    <div className="space-y-4">
                        <div className="bg-green-50 dark:bg-green-950/20 p-4 border border-green-200 dark:border-green-900 rounded-md flex items-start gap-3">
                            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                            <div>
                                <h4 className="font-semibold text-green-800 dark:text-green-400">AWS Role Configuration Ready</h4>
                                <p className="text-sm text-green-700 dark:text-green-500 mt-1">
                                    Role ARN: <span className="font-mono bg-green-100 dark:bg-green-900 px-1 py-0.5 rounded">{cfnData?.roleArn}</span>
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-between mt-4">
                            <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                            <Button onClick={handleSubmitValidation} disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save and Validate Connection
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
