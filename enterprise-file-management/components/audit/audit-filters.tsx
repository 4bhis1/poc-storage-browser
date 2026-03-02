"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { useCallback, useState, useEffect, useTransition } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon, RefreshCw, X } from "lucide-react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

export function AuditFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentAction = searchParams.get("action") || "all";
  const currentTimeRange = searchParams.get("timeRange") || "all";
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const [date, setDate] = useState<DateRange | undefined>(() => {
    if (dateFrom && dateTo) {
      return {
        from: new Date(dateFrom),
        to: new Date(dateTo),
      };
    }
    return undefined;
  });

  // Sync state if URL changes externally
  useEffect(() => {
    if (currentTimeRange !== "custom") {
      setDate(undefined);
    } else if (dateFrom && dateTo) {
      setDate({
        from: new Date(dateFrom),
        to: new Date(dateTo),
      });
    }
  }, [currentTimeRange, dateFrom, dateTo]);

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(name, value);
      return params.toString();
    },
    [searchParams]
  );

  const [open, setOpen] = useState(false);

  const ACTIONS = [
    { value: "all", label: "All Actions", group: "General" },
    { value: "BUCKET_CREATE", label: "Bucket Create", group: "Storage Management" },
    { value: "BUCKET_DELETE", label: "Bucket Delete", group: "Storage Management" },
    { value: "BUCKET_SYNC", label: "Bucket Sync", group: "Storage Management" },
    { value: "FILE_UPLOAD", label: "File Upload", group: "File Operations" },
    { value: "FILE_UPLOAD_INITIATED", label: "File Upload Initiated", group: "File Operations" },
    { value: "MULTIPART_UPLOAD_INITIATED", label: "Multipart Upload", group: "File Operations" },
    { value: "FILE_DOWNLOAD", label: "File Download", group: "File Operations" },
    { value: "FILE_READ", label: "File Read", group: "File Operations" },
    { value: "FILE_DELETE", label: "File Delete", group: "File Operations" },
    { value: "FOLDER_CREATE", label: "Folder Create", group: "File Operations" },
    { value: "FILE_SHARED", label: "File Shared", group: "Sharing & Access" },
    { value: "SHARE_UPDATED", label: "Share Updated", group: "Sharing & Access" },
    { value: "SHARE_REVOKED", label: "Share Revoked", group: "Sharing & Access" },
    { value: "PERMISSION_ADDED", label: "Permission Added", group: "Sharing & Access" },
    { value: "PERMISSION_REMOVED", label: "Permission Removed", group: "Sharing & Access" },
    { value: "TEAM_CREATED", label: "Team Created", group: "Team Management" },
    { value: "TEAM_UPDATED", label: "Team Updated", group: "Team Management" },
    { value: "TEAM_DELETED", label: "Team Deleted", group: "Team Management" },
    { value: "TEAM_MEMBER_ADDED", label: "Team Member Added", group: "Team Management" },
    { value: "TEAM_MEMBER_REMOVED", label: "Team Member Removed", group: "Team Management" },
    { value: "TEAM_POLICIES_UPDATED", label: "Team Policies Updated", group: "Team Management" },
    { value: "USER_INVITED", label: "User Invited", group: "Team Management" },
    { value: "LOGIN", label: "Login", group: "Authentication & Security" },
    { value: "LOGOUT", label: "Logout", group: "Authentication & Security" },
    { value: "IP_ACCESS_DENIED", label: "IP Access Denied", group: "Authentication & Security" },
  ];

  const groupedActions = ACTIONS.reduce((acc, action) => {
    if (!acc[action.group]) acc[action.group] = [];
    acc[action.group].push(action);
    return acc;
  }, {} as Record<string, typeof ACTIONS>);


  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-[180px] h-8 text-xs justify-between"
            >
              <span className="truncate">
                 {ACTIONS.find((action) => action.value === currentAction)?.label || "Filter by action"}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search actions..." className="h-9" />
              <CommandList>
                <CommandEmpty>No action found.</CommandEmpty>
                {Object.entries(groupedActions).map(([groupName, items]) => (
                  <CommandGroup key={groupName} heading={groupName !== "General" ? groupName : undefined}>
                    {items.map((item) => (
                      <CommandItem
                        key={item.value}
                        value={item.label}
                        onSelect={() => {
                          setOpen(false);
                          router.push(`${pathname}?${createQueryString("action", item.value)}`);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            currentAction === item.value ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {item.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Select
          value={currentTimeRange}
          onValueChange={(val) => {
            if (val !== "custom") {
              const params = new URLSearchParams(searchParams.toString());
              params.set("timeRange", val);
              params.delete("dateFrom");
              params.delete("dateTo");
              router.push(`${pathname}?${params.toString()}`);
            } else {
              router.push(`${pathname}?${createQueryString("timeRange", val)}`);
            }
          }}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="90d">Last 90 Days</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>

        {currentTimeRange === "custom" && (
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant={"outline"}
                  size="sm"
                  className={cn(
                    "w-[240px] justify-start text-left font-normal h-8 text-xs",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date?.from ? (
                    date.to ? (
                      <>
                        {format(date.from, "LLL dd, y")} -{" "}
                        {format(date.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(date.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={date?.from}
                  selected={date}
                  onSelect={(newDate) => {
                    setDate(newDate);
                    if (newDate?.from && newDate?.to) {
                      const params = new URLSearchParams(searchParams.toString());
                      params.set("timeRange", "custom");
                      params.set("dateFrom", newDate.from.toISOString());
                      params.set("dateTo", newDate.to.toISOString());
                      router.push(`${pathname}?${params.toString()}`);
                    }
                  }}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
            {date && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setDate(undefined);
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("timeRange", "all");
                  params.delete("dateFrom");
                  params.delete("dateTo");
                  router.push(`${pathname}?${params.toString()}`);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => startTransition(() => router.refresh())}
        disabled={isPending}
        title="Refresh logs"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
        Refresh
      </Button>
    </div>
  );
}
