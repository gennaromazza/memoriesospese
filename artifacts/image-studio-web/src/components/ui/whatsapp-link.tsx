import { formatPhoneForWhatsApp, getWhatsAppLink } from "@shared/phone-utils";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsAppLinkProps {
  phone: string | undefined | null;
  message?: string;
  className?: string;
  showIcon?: boolean;
  iconOnly?: boolean;
  children?: React.ReactNode;
}

export function WhatsAppLink({ 
  phone, 
  message, 
  className,
  showIcon = true,
  iconOnly = false,
  children 
}: WhatsAppLinkProps) {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  
  if (!formattedPhone) {
    if (children) {
      return <span className={className}>{children}</span>;
    }
    return <span className={cn("text-muted-foreground", className)}>-</span>;
  }
  
  const whatsappUrl = getWhatsAppLink(phone, message);
  const displayPhone = phone?.trim() || formattedPhone;
  
  if (iconOnly) {
    return (
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center justify-center p-1.5 rounded-full",
          "bg-green-500 hover:bg-green-600 text-white transition-colors",
          className
        )}
        title={`Chatta su WhatsApp: ${displayPhone}`}
        onClick={(e) => e.stopPropagation()}
      >
        <MessageCircle className="w-4 h-4" />
      </a>
    );
  }
  
  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 text-green-600 hover:text-green-700 hover:underline transition-colors",
        className
      )}
      title={`Chatta su WhatsApp: ${displayPhone}`}
      onClick={(e) => e.stopPropagation()}
    >
      {showIcon && <MessageCircle className="w-4 h-4 shrink-0" />}
      {children || displayPhone}
    </a>
  );
}

export function WhatsAppIconButton({ 
  phone, 
  message,
  className,
  size = "sm"
}: { 
  phone: string | undefined | null; 
  message?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  
  if (!formattedPhone) return null;
  
  const whatsappUrl = getWhatsAppLink(phone, message);
  const sizeClasses = {
    sm: "w-7 h-7",
    md: "w-8 h-8", 
    lg: "w-10 h-10"
  };
  const iconSizes = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5"
  };
  
  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        "bg-green-500 hover:bg-green-600 text-white transition-colors",
        sizeClasses[size],
        className
      )}
      title="Chatta su WhatsApp"
      onClick={(e) => e.stopPropagation()}
    >
      <MessageCircle className={iconSizes[size]} />
    </a>
  );
}
